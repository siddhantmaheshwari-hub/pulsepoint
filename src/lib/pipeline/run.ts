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

  // A run older than the stale window cannot still be alive (the function limit is 300 s), so it crashed or was
  // killed before recording a result. Close it honestly instead of leaving it "running" in System health forever.
  await sql`update collection_runs set status = 'failed', finished_at = now(),
    errors = errors || ${sql.json([{ stage: 'pipeline', message: 'Run did not finish: the server stopped before it could record a result.' }])}
    where status = 'running' and started_at < now() - interval '6 minutes'`;

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

  const stageMs: Record<string, number> = {};
  stats.stage_ms = stageMs;
  let stage = 'start';
  const timed = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    stage = name;
    console.info(`[run ${run.id.slice(0, 8)}] ${name} started`);
    try { return await fn(); } finally { stageMs[name] = Date.now() - t; console.info(`[run ${run.id.slice(0, 8)}] ${name} finished in ${stageMs[name]} ms`); }
  };
  // Watchdog: whatever hangs (a dead socket, a stalled API), the run records an outcome before the 300 s function limit.
  const hardStop = started + Math.min(env.budgetMs + 40_000, 290_000);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const overrun = new Promise<never>((_, reject) => {
    watchdog = setTimeout(() => reject(new Error(`Run stopped by the watchdog: the ${stage} stage was still running at the hard time limit`)), hardStop - Date.now());
  });

  try {
    await Promise.race([overrun, (async () => {
      if (mode !== 'report') stats.collect = await timed('collect', () => collect(run.id, deadline - (doReport ? 120_000 : 60_000), errors));
      stats.analyze = await timed('analyze', () => analyzePending(doReport ? deadline - 45_000 : deadline, errors));
      if (doReport) {
        const liveSources = (stats.collect as { sources?: Record<string, { failures: number; requests: number }> } | undefined)?.sources ?? {};
        const rep = await timed('report', () => generateReport(run.id, trigger === 'manual' ? 'manual' : 'cron_weekly', errors, liveSources, new Date(), deadline));
        reportId = rep.reportId;
        stats.report = rep;
      } else if (trigger === 'cron_weekly') {
        stats.report = { skipped: 'Scheduled report for this week already exists' };
      }
    })()]);
  } catch (e) {
    fatal = true;
    errors.push({ stage: 'pipeline', message: (e as Error).message.slice(0, 500) });
  } finally {
    clearTimeout(watchdog);
  }

  const remaining = (stats.analyze as { remaining?: number } | undefined)?.remaining ?? 0;
  const status = fatal ? (reportId ? 'partial' : 'failed') : errors.length || remaining > 0 ? 'partial' : 'succeeded';
  stats.duration_ms = Date.now() - started;
  await sql`update collection_runs set status = ${status}, finished_at = now(),
    stats = ${sql.json(stats as postgres.JSONValue)}, errors = ${sql.json(errors as unknown as postgres.JSONValue)}, report_id = ${reportId}
    where id = ${run.id}`;
  return { status, runId: run.id, reportId, stats, errors };
}
