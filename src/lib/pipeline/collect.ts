import 'server-only';
import { db, must } from '../db';
import { ADAPTERS } from '../sources';
import type { RawDiscussion } from '../sources/types';
import { countMentions, fingerprint } from '../text';
import type { SourceId } from '../types';
import { loadConfig } from './config';

const DAY = 86_400_000;
const DAILY_LOOKBACK_DAYS = 3; // overlap catches late-arriving/edited items and short outages
const BACKFILL_DAYS = 15; // new keywords get enough history for a week-over-week comparison

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

    for (const kw of cfg.keywords) {
      if (Date.now() > deadline) { result.stoppedForDeadline = true; kwFailed.add(kw.id); continue; }
      const since = new Date(now - (kw.backfilled_at ? DAILY_LOOKBACK_DAYS : BACKFILL_DAYS) * DAY);
      stat.requests++;
      try {
        const items = await adapter.search(kw.term, since, maxItems);
        for (const d of items) {
          const mentions = countMentions(kw.term, `${d.title}\n${d.body}`);
          if (mentions === 0) { result.droppedNoMatch++; continue; } // search engines are fuzzy; we require the phrase
          const key = `${d.sourceId}:${d.externalId}`;
          const entry = found.get(key) ?? { d, matches: new Map<string, Match>() };
          if (found.has(key)) {
            const e = entry.d;
            if (d.createdAt < e.createdAt) e.createdAt = d.createdAt;
            if (d.lastActivityAt > e.lastActivityAt) e.lastActivityAt = d.lastActivityAt;
            if (d.body.length > e.body.length) e.body = d.body;
          }
          entry.matches.set(kw.id, { keyword_id: kw.id, topic_id: kw.topic_id, term: kw.term, mentions });
          found.set(key, entry);
          stat.items++;
        }
      } catch (e) {
        stat.failures++;
        kwFailed.add(kw.id);
        errors.push({ stage: 'collect', source: src.id, message: `${kw.term}: ${(e as Error).message}`.slice(0, 400) });
      }
    }
  }

  // Persist: split into new vs existing so first-seen metadata and analysis state are preserved.
  const bySource = new Map<SourceId, string[]>();
  for (const { d } of found.values()) bySource.set(d.sourceId, [...(bySource.get(d.sourceId) ?? []), d.externalId]);
  const existing = new Map<string, { id: string; created_at_source: string; last_activity_at: string }>();
  for (const [sid, ids] of bySource) {
    for (let i = 0; i < ids.length; i += 200) {
      const rows = must(await db().from('discussions').select('id, external_id, created_at_source, last_activity_at').eq('source_id', sid).in('external_id', ids.slice(i, i + 200)), 'load existing discussions') as { id: string; external_id: string; created_at_source: string; last_activity_at: string }[];
      for (const r of rows) existing.set(`${sid}:${r.external_id}`, r);
    }
  }

  const nowIso = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Record<string, unknown>[] = [];
  for (const [key, { d }] of found) {
    const ex = existing.get(key);
    const base = {
      source_id: d.sourceId, external_id: d.externalId, url: d.url, title: d.title, body_excerpt: d.body, author: d.author,
      score: d.score, comment_count: d.commentCount, tags: d.tags, source_meta: d.meta,
      content_fingerprint: fingerprint(d.title, d.body), last_seen_at: nowIso,
    };
    if (ex) {
      toUpdate.push({ ...base,
        created_at_source: new Date(Math.min(Date.parse(ex.created_at_source), d.createdAt.getTime())).toISOString(),
        last_activity_at: new Date(Math.max(Date.parse(ex.last_activity_at), d.lastActivityAt.getTime())).toISOString() });
    } else {
      toInsert.push({ ...base, created_at_source: d.createdAt.toISOString(), last_activity_at: d.lastActivityAt.toISOString(), first_seen_run_id: runId });
    }
  }
  const idByKey = new Map<string, string>();
  for (const [rows, label] of [[toInsert, 'insert'], [toUpdate, 'update']] as const) {
    for (let i = 0; i < rows.length; i += 300) {
      const saved = must(await db().from('discussions').upsert(rows.slice(i, i + 300), { onConflict: 'source_id,external_id' }).select('id, source_id, external_id, content_fingerprint'), `${label} discussions`) as { id: string; source_id: string; external_id: string; content_fingerprint: string }[];
      for (const s of saved) idByKey.set(`${s.source_id}:${s.external_id}`, s.id);
    }
  }
  result.newDiscussions = toInsert.length;
  result.updatedDiscussions = toUpdate.length;

  // Keyword mentions (kept separate from unique-discussion counts)
  const matchRows: Record<string, unknown>[] = [];
  for (const [key, { matches }] of found) {
    const id = idByKey.get(key);
    if (!id) continue;
    for (const m of matches.values()) matchRows.push({ discussion_id: id, keyword_id: m.keyword_id, topic_id: m.topic_id, term_snapshot: m.term, mention_count: m.mentions });
  }
  for (let i = 0; i < matchRows.length; i += 500) must(await db().from('discussion_matches').upsert(matchRows.slice(i, i + 500), { onConflict: 'discussion_id,keyword_id' }), 'save matches');

  // Cross-source duplicate detection by content fingerprint (earliest record wins)
  const newKeys = new Set(toInsert.map((r) => `${r.source_id}:${r.external_id}`));
  const fps = [...new Set(toInsert.map((r) => r.content_fingerprint as string))];
  for (let i = 0; i < fps.length; i += 200) {
    const rows = must(await db().from('discussions').select('id, source_id, external_id, content_fingerprint, first_seen_at, duplicate_of').in('content_fingerprint', fps.slice(i, i + 200)).order('first_seen_at', { ascending: true }), 'load fingerprints') as { id: string; source_id: string; external_id: string; content_fingerprint: string; duplicate_of: string | null }[];
    const canonical = new Map<string, string>();
    for (const r of rows) {
      const c = canonical.get(r.content_fingerprint);
      if (!c) { canonical.set(r.content_fingerprint, r.id); continue; }
      if (newKeys.has(`${r.source_id}:${r.external_id}`) && !r.duplicate_of) {
        must(await db().from('discussions').update({ duplicate_of: c, analysis_status: 'skipped' }).eq('id', r.id), 'flag duplicate');
        result.duplicatesFlagged++;
      }
    }
  }

  // Only mark keywords as backfilled when every available source succeeded for them
  const done = cfg.keywords.filter((k) => !k.backfilled_at && !kwFailed.has(k.id)).map((k) => k.id);
  if (done.length) must(await db().from('keywords').update({ backfilled_at: nowIso }).in('id', done), 'mark backfilled');
  return result;
}
