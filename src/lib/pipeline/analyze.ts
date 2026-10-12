import 'server-only';
import { db } from '../db';
import { env } from '../env';
import { geminiJson } from '../gemini';
import { DeadlineError, HttpError } from '../http';
import { analysisBatchSchema, cleanAnalysis } from '../schemas';
import { truncate } from '../text';
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, ANALYSIS_VERSION } from './prompts';

const BATCH = 10;
const MAX_ATTEMPTS = 3;
const REQUEUE_DAYS = 56; // the 8 weeks the brief charts

interface Pending {
  id: string; source_id: string; title: string; body_excerpt: string; tags: string[]; source_meta: Record<string, unknown>;
  created_at_source: string; comment_count: number | null; topic_slugs: string[];
}

export interface AnalyzeResult { analyzed: number; relevant: number; failed: number; batches: number; remaining: number; quotesRejected: number }

/**
 * Failures that say nothing about the discussions themselves (overload, rate limit, timeout,
 * dropped connection). They must not use up a discussion's analysis attempts.
 */
export function isTransient(e: unknown): boolean {
  if (e instanceof DeadlineError) return true;
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500;
  const err = e as { name?: string; code?: string; cause?: { code?: string } } | null;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return true;
  const code = err?.code ?? err?.cause?.code ?? '';
  return ['CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED', 'CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)
    || (e instanceof TypeError && /fetch failed/i.test(e.message));
}

/** Neutralise attempts to break out of the <discussion> data fence. */
const fence = (s: string) => s.replace(/<\/?\s*discussion/gi, '[tag]');

export async function analyzePending(deadline: number, errors: { stage: string; message: string }[]): Promise<AnalyzeResult> {
  const sql = db();
  const r: AnalyzeResult = { analyzed: 0, relevant: 0, failed: 0, batches: 0, remaining: 0, quotesRejected: 0 };
  const topics = await sql<{ slug: string; name: string }[]>`select slug, name from topics where is_active order by created_at`;
  const topicSlugs = new Set(topics.map((t) => t.slug));

  // A prompt change bumps ANALYSIS_VERSION and reports only read the current version, so re-queue recent
  // discussions that have no analysis under it. Older history keeps its earlier reading.
  await sql`update discussions d set analysis_status = 'pending', analysis_attempts = 0
    where d.analysis_status = 'done' and d.duplicate_of is null and d.created_at_source >= now() - ${REQUEUE_DAYS + ' days'}::interval
      and not exists (select 1 from discussion_analyses a where a.discussion_id = d.id and a.analysis_version = ${ANALYSIS_VERSION})`;

  while (Date.now() < deadline - 20_000) {
    const batch = await sql<Pending[]>`
      select d.id, d.source_id, d.title, d.body_excerpt, d.tags, d.source_meta, d.created_at_source, d.comment_count,
             coalesce(array_agg(distinct t.slug) filter (where t.slug is not null), '{}') as topic_slugs
      from discussions d
      left join discussion_matches m on m.discussion_id = d.id
      left join topics t on t.id = m.topic_id and t.is_active
      where d.duplicate_of is null and d.analysis_status in ('pending','failed') and d.analysis_attempts < ${MAX_ATTEMPTS}
      group by d.id
      order by d.created_at_source desc, d.id
      limit ${BATCH}`;
    if (!batch.length) break;
    r.batches++;

    const catalog = await sql<{ key: string; label: string }[]>`select key, label from pain_points order by last_seen_at desc nulls last limit 80`;
    const refs = new Map(batch.map((d, i) => [`d${i + 1}`, d]));
    const user = [
      `Topics: ${topics.map((t) => `${t.slug} (${t.name})`).join('; ')}`,
      `Existing pain point catalog (reuse keys): ${catalog.length ? catalog.map((c) => `${c.key} = ${c.label}`).join('; ') : '(empty)'}`,
      ...[...refs].map(([ref, d]) => `<discussion ref="${ref}" source="${d.source_id}" matched_topics="${d.topic_slugs.join(',')}" meta='${JSON.stringify({ ...d.source_meta, replies: d.comment_count, tags: d.tags }).slice(0, 300)}'>\nTITLE: ${fence(truncate(d.title, 300))}\nTEXT: ${fence(truncate(d.body_excerpt, 1800))}\n</discussion>`),
    ].join('\n\n');

    try {
      const parsed = analysisBatchSchema.parse(await geminiJson({ system: ANALYSIS_SYSTEM, user, schema: ANALYSIS_SCHEMA, deadline }));
      const byRef = new Map(parsed.items.map((i) => [i.ref, i]));
      const analyses: Record<string, unknown>[] = [];
      const pains = new Map<string, { key: string; label: string; first_seen_at: string; last_seen_at: string }>();
      const status: [string, string][] = [];
      const tally = { analyzed: 0, relevant: 0, failed: 0, quotesRejected: 0 };

      for (const [ref, d] of refs) {
        const item = byRef.get(ref);
        if (!item) { status.push([d.id, 'failed']); tally.failed++; continue; }
        const c = cleanAnalysis(item, `${d.title}\n${d.body_excerpt}`, topicSlugs);
        if (item.evidence_quote && !c.evidence_verified) tally.quotesRejected++;
        if (c.pain_point_key) {
          const p = pains.get(c.pain_point_key);
          const at = d.created_at_source;
          if (!p) pains.set(c.pain_point_key, { key: c.pain_point_key, label: c.pain_point_label ?? c.pain_point_key, first_seen_at: at, last_seen_at: at });
          else { if (at < p.first_seen_at) p.first_seen_at = at; if (at > p.last_seen_at) p.last_seen_at = at; }
        }
        analyses.push({
          discussion_id: d.id, analysis_version: ANALYSIS_VERSION, model: env.geminiModel,
          is_relevant: c.is_relevant, kind: c.kind, pain_point_key: c.pain_point_key, topic_slug: c.topic_slug,
          affected_workflow: c.affected_workflow, reported_impact: c.reported_impact, existing_workaround: c.existing_workaround,
          tools_mentioned: sql.array(c.tools_mentioned), resolution_status: c.resolution_status,
          evidence_quote: c.evidence_quote, evidence_verified: c.evidence_verified, confidence: c.confidence,
        });
        status.push([d.id, 'done']);
        tally.analyzed++;
        if (c.is_relevant) tally.relevant++;
      }

      // One transaction per batch: catalog, analyses and statuses land together or not at all.
      await sql.begin(async (tx) => {
        if (pains.size) {
          await tx`insert into pain_points ${tx([...pains.values()])}
            on conflict (key) do update set
              first_seen_at = least(pain_points.first_seen_at, excluded.first_seen_at),
              last_seen_at = greatest(pain_points.last_seen_at, excluded.last_seen_at)`;
        }
        if (analyses.length) {
          await tx`insert into discussion_analyses ${tx(analyses)}
            on conflict (discussion_id, analysis_version) do update set
              model = excluded.model, is_relevant = excluded.is_relevant, kind = excluded.kind, pain_point_key = excluded.pain_point_key,
              topic_slug = excluded.topic_slug, affected_workflow = excluded.affected_workflow, reported_impact = excluded.reported_impact,
              existing_workaround = excluded.existing_workaround, tools_mentioned = excluded.tools_mentioned,
              resolution_status = excluded.resolution_status, evidence_quote = excluded.evidence_quote,
              evidence_verified = excluded.evidence_verified, confidence = excluded.confidence, created_at = now()`;
        }
        await tx`update discussions d set analysis_status = u.status, analysis_attempts = d.analysis_attempts + 1
          from (values ${tx(status)}) as u(id, status) where d.id = u.id::uuid`;
      });
      // Counted only after the batch committed.
      r.analyzed += tally.analyzed; r.relevant += tally.relevant; r.failed += tally.failed; r.quotesRejected += tally.quotesRejected;
    } catch (e) {
      r.failed += batch.length;
      errors.push({ stage: 'analyze', message: (e as Error).message.slice(0, 400) });
      if (isTransient(e)) break; // outage, overload, quota or time budget: leave the batch pending for the next run
      // The model answered but the answer was unusable: that costs the batch one of its attempts.
      await sql`update discussions set analysis_status = 'failed', analysis_attempts = analysis_attempts + 1
        where id = any(${sql.array(batch.map((d) => d.id))}::uuid[])`;
      if (e instanceof HttpError && (e.status === 403 || e.status === 400)) break; // auth/config: retry next run
    }
  }

  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from discussions
    where duplicate_of is null and analysis_status in ('pending','failed') and analysis_attempts < ${MAX_ATTEMPTS}`;
  r.remaining = n;
  return r;
}
