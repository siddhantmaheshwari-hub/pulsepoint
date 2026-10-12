import 'server-only';
import type postgres from 'postgres';
import { db } from '../db';
import { ADAPTERS } from '../sources';
import type { RawDiscussion } from '../sources/types';
import { countMentions, fingerprint } from '../text';
import { loadConfig } from './config';

const DAY = 86_400_000;
const DAILY_LOOKBACK_DAYS = 3; // overlap catches late-arriving/edited items and short outages
const BACKFILL_DAYS = 15; // new keywords get enough history for a week-over-week comparison
const CHUNK = 200;
const BREAKER_THRESHOLD = 3;

export interface CollectResult {
  sources: Record<string, { requests: number; failures: number; items: number; skipped?: string }>;
  newDiscussions: number;
  updatedDiscussions: number;
  duplicatesFlagged: number;
  droppedNoMatch: number;
  stoppedForDeadline: boolean;
}

type Match = { keyword_id: string; topic_id: string; term: string; mentions: number };

export async function collect(runId: string, deadline: number, errors: { stage: string; source?: string; message: string }[]): Promise<CollectResult> {
  const sql = db();
  const cfg = await loadConfig();
  const result: CollectResult = { sources: {}, newDiscussions: 0, updatedDiscussions: 0, duplicatesFlagged: 0, droppedNoMatch: 0, stoppedForDeadline: false };
  const found = new Map<string, { d: RawDiscussion; matches: Map<string, Match> }>();
  const kwFailed = new Set<string>();
  const now = Date.now();

  for (const src of cfg.sources.filter((s) => s.is_enabled)) {
    const adapter = ADAPTERS[src.id];
    const stat = (result.sources[src.id] = { requests: 0, failures: 0, items: 0 } as CollectResult['sources'][string]);
    if (!adapter?.isAvailable()) { stat.skipped = 'missing credentials'; continue; }
    const maxItems = Math.max(5, Math.min(100, src.config?.maxItemsPerKeyword ?? 25));
    let consecutiveFailures = 0;

    for (const kw of cfg.keywords) {
      if (Date.now() > deadline) { result.stoppedForDeadline = true; kwFailed.add(kw.id); continue; }
      // Circuit breaker: a source that is down shouldn't consume the whole run's time budget.
      if (consecutiveFailures >= BREAKER_THRESHOLD) { kwFailed.add(kw.id); stat.skipped = `stopped after ${BREAKER_THRESHOLD} consecutive failures`; continue; }
      const since = new Date(now - (kw.backfilled_at ? DAILY_LOOKBACK_DAYS : BACKFILL_DAYS) * DAY);
      stat.requests++;
      try {
        const items = await adapter.search(kw.term, since, maxItems);
        for (const d of items) {
          const mentions = countMentions(kw.term, `${d.title}\n${d.body}`);
          if (mentions === 0) { result.droppedNoMatch++; continue; } // search engines are fuzzy; we require the phrase
          const key = `${d.sourceId}:${d.externalId}`;
          const entry = found.get(key);
          if (entry) {
            const e = entry.d;
            if (d.createdAt < e.createdAt) e.createdAt = d.createdAt;
            if (d.lastActivityAt > e.lastActivityAt) e.lastActivityAt = d.lastActivityAt;
            if (d.body.length > e.body.length) e.body = d.body;
            entry.matches.set(kw.id, { keyword_id: kw.id, topic_id: kw.topic_id, term: kw.term, mentions });
          } else {
            found.set(key, { d: { ...d }, matches: new Map([[kw.id, { keyword_id: kw.id, topic_id: kw.topic_id, term: kw.term, mentions }]]) });
          }
          stat.items++;
        }
        consecutiveFailures = 0;
      } catch (e) {
        consecutiveFailures++;
        stat.failures++;
        kwFailed.add(kw.id);
        errors.push({ stage: 'collect', source: src.id, message: `${kw.term}: ${(e as Error).message}`.slice(0, 400) });
      }
    }
  }

  // Upsert discussions. Dates merge in SQL (earliest first activity, latest last activity);
  // first-seen metadata and analysis state are never overwritten.
  const entries = [...found.values()];
  const idByKey = new Map<string, string>();
  const newIds: string[] = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const rows = entries.slice(i, i + CHUNK).map(({ d }) => ({
      source_id: d.sourceId, external_id: d.externalId, url: d.url, title: d.title, body_excerpt: d.body, author: d.author,
      created_at_source: d.createdAt.toISOString(), last_activity_at: d.lastActivityAt.toISOString(),
      score: d.score, comment_count: d.commentCount, tags: sql.array(d.tags), source_meta: sql.json(d.meta as postgres.JSONValue),
      content_fingerprint: fingerprint(d.title, d.body), first_seen_run_id: runId,
    }));
    const saved = await sql<{ id: string; source_id: string; external_id: string; inserted: boolean }[]>`
      insert into discussions ${sql(rows)}
      on conflict (source_id, external_id) do update set
        url = excluded.url, title = excluded.title, author = excluded.author,
        body_excerpt = case when length(excluded.body_excerpt) > length(discussions.body_excerpt) then excluded.body_excerpt else discussions.body_excerpt end,
        created_at_source = least(discussions.created_at_source, excluded.created_at_source),
        last_activity_at = greatest(discussions.last_activity_at, excluded.last_activity_at),
        score = excluded.score, comment_count = excluded.comment_count, tags = excluded.tags, source_meta = excluded.source_meta,
        last_seen_at = now()
      returning id, source_id, external_id, (xmax = 0) as inserted`;
    for (const s of saved) {
      idByKey.set(`${s.source_id}:${s.external_id}`, s.id);
      if (s.inserted) newIds.push(s.id);
    }
  }
  result.newDiscussions = newIds.length;
  result.updatedDiscussions = entries.length - newIds.length;

  // Keyword mentions (kept separate from unique-discussion counts)
  const matchRows: { discussion_id: string; keyword_id: string; topic_id: string; term_snapshot: string; mention_count: number }[] = [];
  for (const [key, { matches }] of found) {
    const id = idByKey.get(key);
    if (id) for (const m of matches.values()) matchRows.push({ discussion_id: id, keyword_id: m.keyword_id, topic_id: m.topic_id, term_snapshot: m.term, mention_count: m.mentions });
  }
  for (let i = 0; i < matchRows.length; i += CHUNK) {
    await sql`insert into discussion_matches ${sql(matchRows.slice(i, i + CHUNK))}
      on conflict (discussion_id, keyword_id) do update set mention_count = excluded.mention_count, term_snapshot = excluded.term_snapshot`;
  }

  // Cross-source duplicates: a new record whose fingerprint matches an earlier canonical record.
  if (newIds.length) {
    const flagged = await sql`
      with canonical as (
        select distinct on (content_fingerprint) id, content_fingerprint
        from discussions where duplicate_of is null
        order by content_fingerprint, first_seen_at, created_at_source, id)
      update discussions d set duplicate_of = c.id, analysis_status = 'skipped'
      from canonical c
      where d.content_fingerprint = c.content_fingerprint and d.id <> c.id and d.duplicate_of is null and d.id = any(${sql.array(newIds)}::uuid[])
      returning d.id`;
    result.duplicatesFlagged = flagged.length;
  }

  // Only mark keywords as backfilled when every available source succeeded for them
  const done = cfg.keywords.filter((k) => !k.backfilled_at && !kwFailed.has(k.id)).map((k) => k.id);
  if (done.length) await sql`update keywords set backfilled_at = now() where id = any(${sql.array(done)}::uuid[])`;
  return result;
}

