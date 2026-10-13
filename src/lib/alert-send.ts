import 'server-only';
import { alertDay, buildAlertEmail, CLAIM_ALERT_SQL, failingSources, MARK_ALERT_FAILED_SQL, MARK_ALERT_SENT_SQL, redactSecrets, SOURCE_FAIL_RUNS, type Problem, type RunStats } from './alerts';
import { db } from './db';
import { parseRecipients } from './email';
import { deliver } from './email-send';
import { env } from './env';
import { fmtDateTime } from './format';
import type { Trigger } from './pipeline/run';
import { SOURCE_LABEL, type SourceId } from './types';

type RunError = { stage: string; source?: string; message: string };
export type AlertResult = { key: string; status: 'sent' | 'already_alerted' | 'failed' | 'sent_unrecorded'; error?: string };

export function alertsConfigured(): boolean {
  return Boolean(env.resendKey) && parseRecipients(env.alertEmail).length > 0;
}

const fmtErrors = (errs: RunError[]) => errs.slice(0, 8).map((e) => `[${e.stage}${e.source ? ` / ${e.source}` : ''}] ${e.message}`).join('\n');

/**
 * After a scheduled run: alert the maintainer if the run failed, or if a source has failed its last 3 runs.
 * Manual runs never alert (whoever clicked can already see the result).
 */
export async function alertOnFailures(trigger: Trigger, run: { status: string; errors?: RunError[] }, now = new Date()): Promise<AlertResult[]> {
  if (trigger === 'manual' || !alertsConfigured()) return [];
  const problems: Problem[] = [];
  if (run.status === 'failed') {
    problems.push({ key: `run_failed:${trigger}`, what: `The ${trigger === 'cron_weekly' ? 'Friday weekly' : 'daily'} scheduled run failed`, detail: fmtErrors(run.errors ?? []) });
  }
  try {
    const runs = await db()<(RunStats & { errors: RunError[] })[]>`
      select status, started_at, coalesce(stats->'collect'->'sources', '{}'::jsonb) as sources, errors
      from collection_runs where finished_at is not null and stats ? 'collect'
      order by started_at desc limit 10`;
    for (const id of failingSources([...runs])) {
      const last = runs.find((r) => r.errors?.some((e) => e.source === id));
      problems.push({
        key: `source_failing:${id}`,
        what: `${SOURCE_LABEL[id as SourceId] ?? id} failed ${SOURCE_FAIL_RUNS} runs in a row`,
        detail: fmtErrors((last?.errors ?? []).filter((e) => e.source === id)),
      });
    }
  } catch (e) {
    // Can't read run history (e.g. the database is down): the run failure above, if any, still alerts.
    console.error(`[alert] could not read run history: ${(e as Error).message}`);
  }
  const out: AlertResult[] = [];
  for (const p of problems) out.push(await sendAlert(p, now));
  return out;
}

/** Claims (key, IST day) first so the same problem is emailed at most once per day. */
export async function sendAlert(p: Problem, now = new Date()): Promise<AlertResult> {
  const day = alertDay(now, env.tzOffsetMinutes);
  const email = buildAlertEmail(p, `${fmtDateTime(now.toISOString())} IST`, env.appUrl ? `${env.appUrl.replace(/\/+$/, '')}/health` : '');
  let recorded = true;
  try {
    const [claim] = await db().unsafe<{ key: string }[]>(CLAIM_ALERT_SQL, [p.key, day, email.subject]);
    if (!claim) return { key: p.key, status: 'already_alerted' };
  } catch {
    recorded = false; // database unavailable: send anyway; scheduled runs are at most a few per day
  }
  try {
    await deliver(email, parseRecipients(env.alertEmail));
    if (recorded) await db().unsafe(MARK_ALERT_SENT_SQL, [p.key, day]);
    return { key: p.key, status: recorded ? 'sent' : 'sent_unrecorded' };
  } catch (e) {
    const error = redactSecrets((e as Error).message).slice(0, 300);
    if (recorded) await db().unsafe(MARK_ALERT_FAILED_SQL, [p.key, day, error]).catch(() => {});
    return { key: p.key, status: 'failed', error };
  }
}

export async function lastAlert(): Promise<{ key: string; status: string; claimed_at: string; subject: string } | null> {
  try {
    const [row] = await db()<{ key: string; status: string; claimed_at: string; subject: string }[]>`select key, status, claimed_at, subject from alerts order by claimed_at desc limit 1`;
    return row ?? null;
  } catch {
    return null; // table not migrated yet
  }
}
