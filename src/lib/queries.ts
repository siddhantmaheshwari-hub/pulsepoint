import 'server-only';
import { db } from './db';
import type { Synthesis, TopicMetricRow } from './types';

export interface ReportRow {
  id: string; period_start: string; period_end: string; prev_period_start: string; prev_period_end: string; version: number;
  trigger: string; status: string; generated_at: string; totals: Record<string, number>; synthesis: Synthesis | null;
  data_quality: DataQuality; config_snapshot: { keywords: string[]; sources: string[] }; model: string | null; analysis_version: string;
}
export interface DataQuality {
  analysis_coverage: number | null; unanalyzed_in_window: number; collection_runs_in_window: number;
  source_health: Record<string, { failed_requests: number; requests: number }>;
  keywords_added_since_last_report: string[]; keywords_removed_since_last_report: string[];
  has_previous_report: boolean; previous_week_revised: { was: number; now: number } | null;
  insufficient_points: number; low_confidence_points: number;
}

export async function getReport(id?: string): Promise<ReportRow | null> {
  const sql = db();
  const rows = id
    ? await sql<ReportRow[]>`select * from reports where id = ${id}`
    : await sql<ReportRow[]>`select * from reports order by period_end desc, version desc limit 1`;
  return rows[0] ?? null;
}

export async function getMetrics(reportId: string): Promise<TopicMetricRow[]> {
  return [...await db()<TopicMetricRow[]>`select * from topic_metrics where report_id = ${reportId} order by current_count desc, abs_change desc, label`];
}

export async function listReports(limit = 50) {
  return [...await db()<Pick<ReportRow, 'id' | 'period_start' | 'period_end' | 'version' | 'trigger' | 'status' | 'generated_at' | 'totals'>[]>`
    select id, period_start, period_end, version, trigger, status, generated_at, totals from reports order by period_end desc, version desc limit ${limit}`];
}

export interface RunRow { id: string; trigger: string; mode: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, unknown>; errors: { stage: string; source?: string; message: string }[]; report_id: string | null }
export async function listRuns(limit = 30) {
  return [...await db()<RunRow[]>`select * from collection_runs order by started_at desc limit ${limit}`];
}

export async function listTopics() {
  const sql = db();
  const topics = await sql<{ id: string; slug: string; name: string; description: string | null; is_active: boolean }[]>`select id, slug, name, description, is_active from topics order by created_at`;
  const keywords = await sql<{ id: string; topic_id: string; term: string; is_active: boolean; backfilled_at: string | null }[]>`select id, topic_id, term, is_active, backfilled_at from keywords order by created_at`;
  const sources = await sql<{ id: string; name: string; is_enabled: boolean; config: { maxItemsPerKeyword?: number } }[]>`select id, name, is_enabled, config from sources order by id`;
  return { topics: topics.map((t) => ({ ...t, keywords: keywords.filter((k) => k.topic_id === t.id) })), sources: [...sources] };
}
