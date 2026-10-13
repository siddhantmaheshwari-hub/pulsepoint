import 'server-only';
import { db } from './db';
import { BACKFILL_DAYS } from './pipeline/config';
import { ANALYSIS_VERSION } from './pipeline/prompts';
import type { SourceId, Synthesis, TopicMetricRow } from './types';
import { tallyRows, type Tally, type VoteRow } from './votes';

const WEEK = 7 * 86_400_000;

export interface ReportRow {
  id: string; period_start: string; period_end: string; prev_period_start: string; prev_period_end: string; version: number;
  trigger: string; status: string; generated_at: string; totals: Record<string, number>; synthesis: Synthesis | null;
  data_quality: DataQuality; config_snapshot: { keywords: string[]; sources: string[]; topics: string[] }; model: string | null; analysis_version: string;
}
export interface DataQuality {
  analysis_coverage: number | null; unanalyzed_in_window: number; collection_runs_in_window: number;
  source_health: Record<string, { failed_requests: number; requests: number }>;
  keywords_added_since_last_report: string[]; keywords_removed_since_last_report: string[];
  has_previous_report: boolean; previous_week_revised: { was: number; now: number } | null;
  insufficient_points: number; low_confidence_points: number;
}

/** Selected report (?report=) or the latest. Invalid ids fall back to latest. */
export async function getReport(id?: string | null): Promise<ReportRow | null> {
  const sql = db();
  const safe = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  const rows = safe
    ? await sql<ReportRow[]>`select * from reports where id = ${safe}`
    : await sql<ReportRow[]>`select * from reports order by period_end desc, version desc limit 1`;
  if (rows[0] || !safe) return rows[0] ?? null;
  return (await sql<ReportRow[]>`select * from reports order by period_end desc, version desc limit 1`)[0] ?? null;
}

export async function getMetrics(reportId: string): Promise<TopicMetricRow[]> {
  return [...await db()<TopicMetricRow[]>`select * from topic_metrics where report_id = ${reportId} order by current_count desc, abs_change desc, label`];
}

export interface PeriodOption { id: string; period_start: string; period_end: string; version: number }
/** Latest version of each weekly period, newest first — feeds the period selector. */
export async function listPeriods(): Promise<PeriodOption[]> {
  return [...await db()<PeriodOption[]>`
    select id, period_start, period_end, version from (
      select distinct on (period_end) id, period_start, period_end, version from reports order by period_end desc, version desc
    ) p order by period_end desc limit 52`];
}

export async function listReports(limit = 60) {
  return [...await db()<Pick<ReportRow, 'id' | 'period_start' | 'period_end' | 'version' | 'trigger' | 'status' | 'generated_at' | 'totals'>[]>`
    select id, period_start, period_end, version, trigger, status, generated_at, totals from reports order by period_end desc, version desc limit ${limit}`];
}

export interface Freshness { last_success: string | null; last_status: string | null; last_started: string | null; sources_enabled: number; queued: number }
export async function getFreshness(): Promise<Freshness> {
  const [f] = await db()<Freshness[]>`select
    (select max(finished_at) from collection_runs where status in ('succeeded','partial')) as last_success,
    (select status from collection_runs order by started_at desc limit 1) as last_status,
    (select started_at from collection_runs order by started_at desc limit 1) as last_started,
    (select count(*)::int from sources where is_enabled) as sources_enabled,
    (select count(*)::int from discussions where duplicate_of is null and analysis_status in ('pending','failed') and analysis_attempts < 3) as queued`;
  return f;
}

export interface WeekVolume { week_end: string; collected: number; pain: number; monitored: boolean }
/** Unique (non-duplicate) discussions per 7-day bucket ending at periodEnd, oldest first. `version` = the report's analysis_version, so charts match the snapshot. */
export async function getWeeklyVolume(periodEnd: string, version: string = ANALYSIS_VERSION, weeks = 8): Promise<WeekVolume[]> {
  const rows = await db()<{ wk: number; collected: number; pain: number }[]>`
    with d as (
      select floor(extract(epoch from (${periodEnd}::timestamptz - d.created_at_source)) / 604800)::int as wk, a.kind, a.is_relevant
      from discussions d
      left join discussion_analyses a on a.discussion_id = d.id and a.analysis_version = ${version}
      where d.duplicate_of is null and d.created_at_source < ${periodEnd}::timestamptz
        and d.created_at_source >= ${periodEnd}::timestamptz - (${weeks} * interval '7 days'))
    select wk, count(*)::int as collected, count(*) filter (where is_relevant and kind in ('workflow_pain','unmet_need'))::int as pain
    from d group by wk`;
  // Monitoring reaches back BACKFILL_DAYS before the first run; earlier weeks were never collected (a gap, not a zero).
  const [{ first }] = await db()<{ first: string | null }[]>`select min(started_at) as first from collection_runs`;
  const since = first ? Date.parse(first) - BACKFILL_DAYS * 86_400_000 : Infinity;
  const by = new Map(rows.map((r) => [r.wk, r]));
  const end = Date.parse(periodEnd);
  return Array.from({ length: weeks }, (_, i) => weeks - 1 - i).map((wk) => ({
    week_end: new Date(end - wk * WEEK).toISOString(), collected: by.get(wk)?.collected ?? 0, pain: by.get(wk)?.pain ?? 0,
    monitored: end - wk * WEEK > since,
  }));
}

export type Sparks = Record<string, (number | null)[]>;
/** Weekly counts per pain point from stored snapshots (latest version per week). null = no report that week. */
export async function getSparklines(keys: string[], periodEnd: string, weeks = 8): Promise<{ periods: string[]; series: Sparks }> {
  const sql = db();
  const from = new Date(Date.parse(periodEnd) - (weeks - 1) * WEEK - 3_600_000).toISOString();
  const periods = (await sql<{ period_end: string }[]>`select distinct period_end from reports where period_end <= ${periodEnd} and period_end >= ${from} order by period_end`).map((p) => p.period_end);
  const series: Sparks = Object.fromEntries(keys.map((k) => [k, periods.map(() => 0 as number | null)]));
  if (!keys.length || !periods.length) return { periods, series };
  const rows = await sql<{ pain_point_key: string; period_end: string; count: number }[]>`
    select distinct on (m.pain_point_key, r.period_end) m.pain_point_key, r.period_end, m.current_count as count
    from topic_metrics m join reports r on r.id = m.report_id
    where m.pain_point_key = any(${sql.array(keys)}::text[]) and r.period_end <= ${periodEnd} and r.period_end >= ${from}
    order by m.pain_point_key, r.period_end, r.version desc`;
  const idx = new Map(periods.map((p, i) => [p, i]));
  for (const r of rows) { const i = idx.get(r.period_end); if (i !== undefined && series[r.pain_point_key]) series[r.pain_point_key][i] = r.count; }
  return { periods, series };
}

export interface SourceBreakdown { id: SourceId; name: string; is_enabled: boolean; max_items: number; cur_collected: number; prev_collected: number; cur_pain: number; prev_pain: number }
export async function getSourceBreakdown(r: Pick<ReportRow, 'period_start' | 'period_end' | 'prev_period_start'> & { analysis_version?: string }): Promise<SourceBreakdown[]> {
  return [...await db()<SourceBreakdown[]>`
    select s.id, s.name, s.is_enabled, coalesce((s.config->>'maxItemsPerKeyword')::int, 25) as max_items,
      count(d.id) filter (where d.created_at_source >= ${r.period_start} and d.created_at_source < ${r.period_end})::int as cur_collected,
      count(d.id) filter (where d.created_at_source >= ${r.prev_period_start} and d.created_at_source < ${r.period_start})::int as prev_collected,
      count(d.id) filter (where d.created_at_source >= ${r.period_start} and d.created_at_source < ${r.period_end} and a.is_relevant and a.kind in ('workflow_pain','unmet_need'))::int as cur_pain,
      count(d.id) filter (where d.created_at_source >= ${r.prev_period_start} and d.created_at_source < ${r.period_start} and a.is_relevant and a.kind in ('workflow_pain','unmet_need'))::int as prev_pain
    from sources s
    left join discussions d on d.source_id = s.id and d.duplicate_of is null
    left join discussion_analyses a on a.discussion_id = d.id and a.analysis_version = ${r.analysis_version ?? ANALYSIS_VERSION}
    group by s.id order by s.id`];
}

export interface DiscussionRow {
  id: string; source_id: SourceId; url: string; title: string; body_excerpt: string; created_at_source: string; score: number | null; comment_count: number | null;
  analysis_status: string; kind: string | null; is_relevant: boolean | null; pain_point_key: string | null; pain_label: string | null; topic_slug: string | null;
  resolution_status: string | null; evidence_quote: string | null; evidence_verified: boolean | null; confidence: number | null;
  existing_workaround: string | null; affected_workflow: string | null; reported_impact: string | null;
}
export interface DiscussionFilter { q?: string; source?: string; topic?: string; kind?: string; key?: string; start: string; end: string; page?: number }
const PAGE = 25;
export async function listDiscussions(f: DiscussionFilter): Promise<{ rows: DiscussionRow[]; total: number; pageSize: number }> {
  const sql = db();
  const pat = f.q ? `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const where = sql`
    where d.duplicate_of is null and d.created_at_source >= ${f.start} and d.created_at_source < ${f.end}
    ${pat ? sql`and (d.title ilike ${pat} or d.body_excerpt ilike ${pat} or p.label ilike ${pat})` : sql``}
    ${f.source && f.source !== 'all' ? sql`and d.source_id = ${f.source}` : sql``}
    ${f.topic && f.topic !== 'all' ? sql`and a.topic_slug = ${f.topic}` : sql``}
    ${f.key ? sql`and a.pain_point_key = ${f.key}` : sql``}
    ${f.kind === 'pain' ? sql`and a.is_relevant and a.kind in ('workflow_pain','unmet_need')`
      : f.kind === 'pending' ? sql`and d.analysis_status <> 'done'`
      : f.kind && f.kind !== 'all' ? sql`and a.kind = ${f.kind}` : sql``}`;
  const from = sql`from discussions d
    left join discussion_analyses a on a.discussion_id = d.id and a.analysis_version = ${ANALYSIS_VERSION}
    left join pain_points p on p.key = a.pain_point_key`;
  const page = Math.max(0, (f.page ?? 1) - 1);
  const rows = await sql<DiscussionRow[]>`
    select d.id, d.source_id, d.url, d.title, d.body_excerpt, d.created_at_source, d.score, d.comment_count, d.analysis_status,
      a.kind, a.is_relevant, a.pain_point_key, p.label as pain_label, a.topic_slug, a.resolution_status, a.evidence_quote, a.evidence_verified,
      a.confidence, a.existing_workaround, a.affected_workflow, a.reported_impact
    ${from} ${where} order by d.created_at_source desc, d.id limit ${PAGE} offset ${page * PAGE}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n ${from} ${where}`;
  return { rows: [...rows], total: n, pageSize: PAGE };
}

export async function getKeywordCounts(start: string, end: string): Promise<Map<string, { discussions: number; mentions: number }>> {
  const rows = await db()<{ keyword_id: string; discussions: number; mentions: number }[]>`
    select m.keyword_id, count(distinct m.discussion_id)::int as discussions, coalesce(sum(m.mention_count), 0)::int as mentions
    from discussion_matches m join discussions d on d.id = m.discussion_id
    where d.duplicate_of is null and d.created_at_source >= ${start} and d.created_at_source < ${end}
    group by m.keyword_id`;
  return new Map(rows.map((r) => [r.keyword_id, r]));
}

export interface RunRow { id: string; trigger: string; mode: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, unknown>; errors: { stage: string; source?: string; message: string }[]; report_id: string | null }
export async function listRuns(limit = 30) {
  return [...await db()<RunRow[]>`select * from collection_runs order by started_at desc limit ${limit}`];
}

export async function getHealthTotals() {
  const [t] = await db()<{ discussions: number; duplicates: number; queued: number; gave_up: number; analyzed: number; reports: number; weeks: number; first_data: string | null; pain_points: number }[]>`select
    (select count(*)::int from discussions where duplicate_of is null) as discussions,
    (select count(*)::int from discussions where duplicate_of is not null) as duplicates,
    (select count(*)::int from discussions where duplicate_of is null and analysis_status in ('pending','failed') and analysis_attempts < 3) as queued,
    (select count(*)::int from discussions where duplicate_of is null and analysis_status = 'failed' and analysis_attempts >= 3) as gave_up,
    (select count(*)::int from discussion_analyses where analysis_version = ${ANALYSIS_VERSION}) as analyzed,
    (select count(*)::int from reports) as reports,
    (select count(distinct period_end)::int from reports) as weeks,
    (select min(created_at_source) from discussions) as first_data,
    (select count(*)::int from pain_points) as pain_points`;
  return t;
}

export async function listTopics() {
  const sql = db();
  const topics = await sql<{ id: string; slug: string; name: string; description: string | null; is_active: boolean }[]>`select id, slug, name, description, is_active from topics order by created_at`;
  const keywords = await sql<{ id: string; topic_id: string; term: string; is_active: boolean; backfilled_at: string | null }[]>`select id, topic_id, term, is_active, backfilled_at from keywords order by created_at`;
  const sources = await sql<{ id: SourceId; name: string; is_enabled: boolean; config: { maxItemsPerKeyword?: number } }[]>`select id, name, is_enabled, config from sources order by id`;
  return { topics: topics.map((t) => ({ ...t, keywords: keywords.filter((k) => k.topic_id === t.id) })), sources: [...sources] };
}

/** Current window for pages that are not tied to a report (no report yet → last 7 days). */
export function windowFor(report: ReportRow | null) {
  if (report) return { start: report.period_start, end: report.period_end, prevStart: report.prev_period_start };
  const end = new Date().toISOString();
  return { start: new Date(Date.now() - WEEK).toISOString(), end, prevStart: new Date(Date.now() - 2 * WEEK).toISOString() };
}

export type FeedbackType = 'finding' | 'underserved' | 'recommendation';
/** Team votes for one report, keyed "type:index" → who voted 👍 and 👎. */
export async function getFeedback(reportId: string): Promise<Record<string, Tally>> {
  const rows = await db()<VoteRow[]>`
    select item_type, item_index, voter, useful from finding_feedback where report_id = ${reportId}`;
  return tallyRows([...rows]);
}

/** Usefulness per report across all voters: how many votes said useful (Nine Checks #5). */
export async function getUsefulness(): Promise<Map<string, { rated: number; useful: number }>> {
  const rows = await db()<{ report_id: string; rated: number; useful: number }[]>`
    select report_id, count(*)::int as rated, count(*) filter (where useful)::int as useful from finding_feedback group by report_id`;
  return new Map(rows.map((r) => [r.report_id, { rated: r.rated, useful: r.useful }]));
}
