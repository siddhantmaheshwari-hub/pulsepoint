import 'server-only';
import { db, must } from '../db';
import { env } from '../env';
import { geminiJson } from '../gemini';
import { HttpError } from '../http';
import { analysisBatchSchema, cleanAnalysis } from '../schemas';
import { truncate } from '../text';
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, ANALYSIS_VERSION } from './prompts';

const BATCH = 10;
const MAX_ATTEMPTS = 3;

interface Pending {
  id: string; source_id: string; title: string; body_excerpt: string; tags: string[]; source_meta: Record<string, unknown>;
  created_at_source: string; analysis_attempts: number; comment_count: number | null;
}

export interface AnalyzeResult { analyzed: number; relevant: number; failed: number; batches: number; remaining: number; quotesRejected: number }

export async function analyzePending(deadline: number, errors: { stage: string; message: string }[]): Promise<AnalyzeResult> {
  const r: AnalyzeResult = { analyzed: 0, relevant: 0, failed: 0, batches: 0, remaining: 0, quotesRejected: 0 };
  const topics = must(await db().from('topics').select('id, slug, name').eq('is_active', true), 'load topics') as { id: string; slug: string; name: string }[];
  const topicSlugs = new Set(topics.map((t) => t.slug));
  const slugById = new Map(topics.map((t) => [t.id, t.slug]));

  while (Date.now() < deadline - 20_000) {
    const batch = must(await db().from('discussions')
      .select('id, source_id, title, body_excerpt, tags, source_meta, created_at_source, analysis_attempts, comment_count')
      .is('duplicate_of', null).in('analysis_status', ['pending', 'failed']).lt('analysis_attempts', MAX_ATTEMPTS)
      .order('created_at_source', { ascending: false }).limit(BATCH), 'load pending') as Pending[];
    if (!batch.length) break;
    r.batches++;

    const catalog = must(await db().from('pain_points').select('key, label').order('last_seen_at', { ascending: false, nullsFirst: false }).limit(80), 'load catalog') as { key: string; label: string }[];
    const matches = must(await db().from('discussion_matches').select('discussion_id, topic_id').in('discussion_id', batch.map((b) => b.id)), 'load matches') as { discussion_id: string; topic_id: string }[];
    const topicsFor = new Map<string, Set<string>>();
    for (const m of matches) { const s = topicsFor.get(m.discussion_id) ?? new Set(); const slug = slugById.get(m.topic_id); if (slug) s.add(slug); topicsFor.set(m.discussion_id, s); }

    const refs = new Map(batch.map((d, i) => [`d${i + 1}`, d]));
    const user = [
      `Topics: ${topics.map((t) => `${t.slug} (${t.name})`).join('; ')}`,
      `Existing pain point catalog (reuse keys): ${catalog.length ? catalog.map((c) => `${c.key} = ${c.label}`).join('; ') : '(empty)'}`,
      ...[...refs].map(([ref, d]) => `<discussion ref="${ref}" source="${d.source_id}" matched_topics="${[...(topicsFor.get(d.id) ?? [])].join(',')}" meta='${JSON.stringify({ ...d.source_meta, replies: d.comment_count, tags: d.tags }).slice(0, 300)}'>\nTITLE: ${fence(truncate(d.title, 300))}\nTEXT: ${fence(truncate(d.body_excerpt, 1800))}\n</discussion>`),
    ].join('\n\n');

    try {
      const parsed = analysisBatchSchema.parse(await geminiJson({ system: ANALYSIS_SYSTEM, user, schema: ANALYSIS_SCHEMA }));
      const byRef = new Map(parsed.items.map((i) => [i.ref, i]));
      const analyses: Record<string, unknown>[] = [];
      const painSeen = new Map<string, { label: string; min: number; max: number }>();
      const statusUpdates: { id: string; status: string; attempts: number }[] = [];

      for (const [ref, d] of refs) {
        const item = byRef.get(ref);
        if (!item) { statusUpdates.push({ id: d.id, status: 'failed', attempts: d.analysis_attempts + 1 }); r.failed++; continue; }
        const c = cleanAnalysis(item, `${d.title}\n${d.body_excerpt}`, topicSlugs);
        if (item.evidence_quote && !c.evidence_verified) r.quotesRejected++;
        if (c.pain_point_key) {
          const t = Date.parse(d.created_at_source);
          const p = painSeen.get(c.pain_point_key) ?? { label: c.pain_point_label ?? c.pain_point_key, min: t, max: t };
          p.min = Math.min(p.min, t); p.max = Math.max(p.max, t);
          painSeen.set(c.pain_point_key, p);
        }
        analyses.push({ discussion_id: d.id, analysis_version: ANALYSIS_VERSION, model: env.geminiModel, ...omit(c, 'pain_point_label') });
        statusUpdates.push({ id: d.id, status: 'done', attempts: d.analysis_attempts + 1 });
        r.analyzed++;
        if (c.is_relevant) r.relevant++;
      }

      if (painSeen.size) {
        const existing = must(await db().from('pain_points').select('key, label, first_seen_at, last_seen_at').in('key', [...painSeen.keys()]), 'load pain points') as { key: string; label: string; first_seen_at: string | null; last_seen_at: string | null }[];
        const exMap = new Map(existing.map((e) => [e.key, e]));
        const rows = [...painSeen].map(([key, p]) => {
          const ex = exMap.get(key);
          const first = Math.min(p.min, ex?.first_seen_at ? Date.parse(ex.first_seen_at) : Infinity);
          const last = Math.max(p.max, ex?.last_seen_at ? Date.parse(ex.last_seen_at) : -Infinity);
          return { key, label: ex?.label ?? p.label, first_seen_at: new Date(first).toISOString(), last_seen_at: new Date(last).toISOString() };
        });
        must(await db().from('pain_points').upsert(rows, { onConflict: 'key' }), 'save pain points');
      }
      if (analyses.length) must(await db().from('discussion_analyses').upsert(analyses, { onConflict: 'discussion_id,analysis_version' }), 'save analyses');
      await Promise.all(statusUpdates.map((u) => db().from('discussions').update({ analysis_status: u.status, analysis_attempts: u.attempts }).eq('id', u.id)));
    } catch (e) {
      r.failed += batch.length;
      errors.push({ stage: 'analyze', message: (e as Error).message.slice(0, 400) });
      await Promise.all(batch.map((d) => db().from('discussions').update({ analysis_status: 'failed', analysis_attempts: d.analysis_attempts + 1 }).eq('id', d.id)));
      if (e instanceof HttpError && (e.status === 429 || e.status === 403 || e.status === 400)) break; // quota/auth/config problem: stop, retry next run
    }
  }

  const { count } = await db().from('discussions').select('id', { count: 'exact', head: true }).is('duplicate_of', null).in('analysis_status', ['pending', 'failed']).lt('analysis_attempts', MAX_ATTEMPTS);
  r.remaining = count ?? 0;
  return r;
}

/** Neutralise attempts to break out of the <discussion> data fence. */
const fence = (s: string) => s.replace(/<\/?\s*discussion/gi, '[tag]');

function omit<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const { [k]: _drop, ...rest } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}
