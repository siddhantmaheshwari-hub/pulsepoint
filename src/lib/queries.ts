import 'server-only';
import { db, must } from './db';
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
  const q = db().from('reports').select('*');
  const rows = must(await (id ? q.eq('id', id) : q.order('period_end', { ascending: false }).order('version', { ascending: false })).limit(1), 'load report') as ReportRow[];
  return rows[0] ?? null;
}

export async function getMetrics(reportId: string): Promise<TopicMetricRow[]> {
  const rows = must(await db().from('topic_metrics').select('*').eq('report_id', reportId).order('current_count', { ascending: false }), 'load metrics') as TopicMetricRow[];
  return rows.map((r) => ({ ...r, pct_change: r.pct_change === null ? null : Number(r.pct_change), avg_confidence: r.avg_confidence === null ? null : Number(r.avg_confidence), verified_share: r.verified_share === null ? null : Number(r.verified_share) }));
}

export async function listReports(limit = 50) {
  return must(await db().from('reports').select('id, period_start, period_end, version, trigger, status, generated_at, totals').order('period_end', { ascending: false }).order('version', { ascending: false }).limit(limit), 'list reports') as Pick<ReportRow, 'id' | 'period_start' | 'period_end' | 'version' | 'trigger' | 'status' | 'generated_at' | 'totals'>[];
}

export interface RunRow { id: string; trigger: string; mode: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, unknown>; errors: { stage: string; source?: string; message: string }[]; report_id: string | null }
export async function listRuns(limit = 30) {
  return must(await db().from('collection_runs').select('*').order('started_at', { ascending: false }).limit(limit), 'list runs') as RunRow[];
}

export async function listTopics() {
  const topics = must(await db().from('topics').select('id, slug, name, description, is_active, created_at').order('created_at'), 'list topics') as { id: string; slug: string; name: string; description: string | null; is_active: boolean }[];
  const keywords = must(await db().from('keywords').select('id, topic_id, term, is_active, backfilled_at').order('created_at'), 'list keywords') as { id: string; topic_id: string; term: string; is_active: boolean; backfilled_at: string | null }[];
  const sources = must(await db().from('sources').select('id, name, is_enabled, config').order('id'), 'list sources') as { id: string; name: string; is_enabled: boolean; config: { maxItemsPerKeyword?: number } }[];
  return { topics: topics.map((t) => ({ ...t, keywords: keywords.filter((k) => k.topic_id === t.id) })), sources };
}
