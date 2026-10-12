import 'server-only';
import { db } from './db';
import { buildMetrics, type AnalyzedRow, type PainPointInfo } from './metrics';
import { BACKFILL_DAYS } from './pipeline/config';
import { ANALYSIS_VERSION } from './pipeline/prompts';
import type { WeekVolume } from './queries';
import type { ReportWindows } from './windows';

/**
 * Deterministic pain-point metrics for any pair of windows (current vs previous), straight from stored analyses.
 * The weekly report and the Month / Range views both use this, so their numbers are computed the same way.
 * No AI call happens here.
 */
export async function loadWindowMetrics(w: ReportWindows) {
  const sql = db();
  const rows = await sql<AnalyzedRow[]>`
    select a.discussion_id, a.is_relevant, a.kind, a.pain_point_key, a.topic_slug, a.resolution_status,
           a.evidence_quote, a.evidence_verified, a.confidence, a.existing_workaround,
           d.source_id, d.title, d.url, d.created_at_source, d.score
    from discussion_analyses a join discussions d on d.id = a.discussion_id
    where a.analysis_version = ${ANALYSIS_VERSION} and d.duplicate_of is null
      and d.created_at_source >= ${w.previousStart.toISOString()} and d.created_at_source < ${w.currentEnd.toISOString()}`;

  const keys = [...new Set(rows.map((r) => r.pain_point_key).filter(Boolean))] as string[];
  const info = new Map<string, PainPointInfo>();
  if (keys.length) {
    const pp = await sql<({ key: string } & PainPointInfo)[]>`select key, label, first_seen_at, last_seen_at from pain_points where key = any(${sql.array(keys)}::text[])`;
    for (const p of pp) info.set(p.key, p);
  }
  return { rows: [...rows], metrics: buildMetrics([...rows], w, info) };
}

/** Monitoring reaches back BACKFILL_DAYS before the first run; anything earlier was never collected (a gap, not a zero). */
export async function monitoringSince(): Promise<number | null> {
  const [{ first }] = await db()<{ first: string | null }[]>`select min(started_at) as first from collection_runs`;
  return first ? Date.parse(first) - BACKFILL_DAYS * 86_400_000 : null;
}

/** Unique discussions per bucket (1 or 7 days) across [start, end), oldest first. Same shape as the weekly chart. */
export async function getPeriodVolume(start: Date, end: Date, bucketDays: number, since: number | null): Promise<WeekVolume[]> {
  const size = bucketDays * 86_400_000;
  const rows = await db()<{ b: number; collected: number; pain: number }[]>`
    with d as (
      select floor(extract(epoch from (d.created_at_source - ${start.toISOString()}::timestamptz)) / ${size / 1000})::int as b, a.kind, a.is_relevant
      from discussions d
      left join discussion_analyses a on a.discussion_id = d.id and a.analysis_version = ${ANALYSIS_VERSION}
      where d.duplicate_of is null and d.created_at_source >= ${start.toISOString()} and d.created_at_source < ${end.toISOString()})
    select b, count(*)::int as collected, count(*) filter (where is_relevant and kind in ('workflow_pain','unmet_need'))::int as pain
    from d group by b`;
  const by = new Map(rows.map((r) => [r.b, r]));
  const n = Math.ceil((end.getTime() - start.getTime()) / size);
  return Array.from({ length: n }, (_, i) => {
    const bucketEnd = Math.min(start.getTime() + (i + 1) * size, end.getTime());
    return { week_end: new Date(bucketEnd).toISOString(), collected: by.get(i)?.collected ?? 0, pain: by.get(i)?.pain ?? 0, monitored: since !== null && bucketEnd > since };
  });
}
