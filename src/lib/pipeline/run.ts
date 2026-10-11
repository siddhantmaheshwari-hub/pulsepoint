import 'server-only';
import { db, must } from '../db';
import { env } from '../env';
import { reportWindows } from '../windows';
import { analyzePending } from './analyze';
import { collect } from './collect';
import { configSnapshot, loadConfig } from './config';
import { generateReport } from './report';

export type Trigger = 'cron_daily' | 'cron_weekly' | 'manual';
export type Mode = 'collect' | 'report' | 'full';

export async function runPipeline(trigger: Trigger, mode: Mode) {
  const started = Date.now();
  const deadline = started + env.budgetMs;

  // Concurrency guard: one pipeline at a time.
  const running = must(await db().from('collection_runs').select('id, started_at').eq('status', 'running').gte('started_at', new Date(started - 6 * 60_000).toISOString()).limit(1), 'check running') as { id: string }[];
  if (running.length) return { status: 'skipped' as const, reason: 'Another run is in progress', runId: running[0].id };

  // Idempotency: the scheduled Friday report is generated once per period (manual runs create new versions).
  let doReport = mode !== 'collect';
  if (trigger === 'cron_weekly') {
    const end = reportWindows(new Date(), env.tzOffsetMinutes).currentEnd.toISOString();
    const exists = must(await db().from('reports').select('id').eq('period_end', end).eq('trigger', 'cron_weekly').limit(1), 'check report') as { id: string }[];
    if (exists.length) doReport = false;
  }

  const cfg = await loadConfig();
  const run = must(await db().from('collection_runs').insert({ trigger, mode, config_snapshot: configSnapshot(cfg) }).select('id').single(), 'create run') as { id: string };
  const errors: { stage: string; source?: string; message: string }[] = [];
  const stats: Record<string, unknown> = {};
  let reportId: string | null = null;
  let fatal = false;

  try {
    if (mode !== 'report') stats.collect = await collect(run.id, deadline - (doReport ? 120_000 : 60_000), errors);
    const analyzeDeadline = doReport ? deadline - 45_000 : deadline;
    stats.analyze = await analyzePending(analyzeDeadline, errors);
    if (doReport) {
      const rep = await generateReport(run.id, trigger === 'manual' ? 'manual' : 'cron_weekly', errors);
      reportId = rep.reportId;
      stats.report = rep;
    }
  } catch (e) {
    fatal = true;
    errors.push({ stage: 'pipeline', message: (e as Error).message.slice(0, 500) });
  }

  const remaining = (stats.analyze as { remaining?: number } | undefined)?.remaining ?? 0;
  const status = fatal ? (reportId ? 'partial' : 'failed') : errors.length || remaining > 0 ? 'partial' : 'succeeded';
  stats.duration_ms = Date.now() - started;
  await db().from('collection_runs').update({ status, finished_at: new Date().toISOString(), stats, errors, report_id: reportId }).eq('id', run.id);
  return { status, runId: run.id, reportId, stats, errors };
}
