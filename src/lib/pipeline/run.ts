import 'server-only';
import type postgres from 'postgres';
import { db } from '../db';
import { env } from '../env';
import { reportWindows } from '../windows';
import { analyzePending } from './analyze';
import { collect } from './collect';
import { configSnapshot, loadConfig } from './config';
import { generateReport } from './report';

export type Trigger = 'cron_daily' | 'cron_weekly' | 'manual';
export type Mode = 'collect' | 'report' | 'full';

export async function runPipeline(trigger: Trigger, mode: Mode) {
  const sql = db();
  const started = Date.now();
  const deadline = started + env.budgetMs;

  // Concurrency guard: one pipeline at a time (a crashed run stops blocking after 6 minutes).
  const [running] = await sql<{ id: string }[]>`select id from collection_runs where status = 'running' and started_at >= now() - interval '6 minutes' limit 1`;
  if (running) return { status: 'skipped' as const, reason: 'Another run is in progress', runId: running.id };

  // Idempotency: the scheduled Friday report is generated once per period (manual runs create new versions).
  let doReport = mode !== 'collect';
  if (trigger === 'cron_weekly') {
    const end = reportWindows(new Date(), env.tzOffsetMinutes).currentEnd.toISOString();
    const [exists] = await sql`select 1 from reports where period_end = ${end} and trigger = 'cron_weekly' limit 1`;
    if (exists) doReport = false;
  }

  const cfg = await loadConfig();
  const [run] = await sql<{ id: string }[]>`insert into collection_runs (trigger, mode, config_snapshot)
    values (${trigger}, ${mode}, ${sql.json(configSnapshot(cfg))}) returning id`;
  const errors: { stage: string; source?: string; message: string }[] = [];
  const stats: Record<string, unknown> = {};
  let reportId: string | null = null;
  let fatal = false;

  try {
    if (mode !== 'report') stats.collect = await collect(run.id, deadline - (doReport ? 120_000 : 60_000), errors);
    stats.analyze = await analyzePending(doReport ? deadline - 45_000 : deadline, errors);
    if (doReport) {
      const liveSources = (stats.collect as { sources?: Record<string, { failures: number; requests: number }> } | undefined)?.sources ?? {};
      const rep = await generateReport(run.id, trigger === 'manual' ? 'manual' : 'cron_weekly', errors, liveSources);
      reportId = rep.reportId;
      stats.report = rep;
    } else if (trigger === 'cron_weekly') {
      stats.report = { skipped: 'Scheduled report for this week already exists' };
    }
  } catch (e) {
    fatal = true;
    errors.push({ stage: 'pipeline', message: (e as Error).message.slice(0, 500) });
  }

  const remaining = (stats.analyze as { remaining?: number } | undefined)?.remaining ?? 0;
  const status = fatal ? (reportId ? 'partial' : 'failed') : errors.length || remaining > 0 ? 'partial' : 'succeeded';
  stats.duration_ms = Date.now() - started;
  await sql`update collection_runs set status = ${status}, finished_at = now(),
    stats = ${sql.json(stats as postgres.JSONValue)}, errors = ${sql.json(errors as unknown as postgres.JSONValue)}, report_id = ${reportId}
    where id = ${run.id}`;
  return { status, runId: run.id, reportId, stats, errors };
}
