import 'server-only';
import { NextResponse } from 'next/server';
import { alertOnFailures, type AlertResult } from './alert-send';
import { isReportFriday, sendWeeklyBrief, type SendResult } from './email-send';
import { env, missingEnv } from './env';
import { runPipeline, type Mode, type Trigger } from './pipeline/run';

export async function handleCron(req: Request, trigger: Trigger, mode: Mode) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: `Missing environment variables: ${missing.join(', ')}` }, { status: 500 });

  // Friday catch-up: if the weekly run saved the brief but the email didn't go out, send it before this run starts.
  let email: SendResult | undefined;
  if (trigger === 'cron_daily' && isReportFriday()) email = await safeSend();

  // A run that crashes outright (e.g. the database is unreachable) is still reported, and alerted, as failed.
  const result = await runPipeline(trigger, mode).catch((e: Error) => ({
    status: 'failed' as const, runId: null, reportId: null, stats: {}, errors: [{ stage: 'pipeline', message: e.message.slice(0, 500) }],
  }));

  // Weekly: email the brief once the report exists (also covers a report saved by an earlier weekly attempt).
  if (trigger === 'cron_weekly') email = await safeSend();
  if (email) console.info(`[email] ${email.status}${email.error ? `: ${email.error}` : ''}`);

  // Tell the maintainer about a failed scheduled run or a source failing 3 runs in a row (once per problem per day).
  const alerts: AlertResult[] = await alertOnFailures(trigger, result).catch((e: Error) => [{ key: 'alerting', status: 'failed' as const, error: e.message.slice(0, 200) }]);
  for (const a of alerts) console.info(`[alert] ${a.key}: ${a.status}${a.error ? ` (${a.error})` : ''}`);

  return NextResponse.json({ ...result, email, alerts }, { status: result.status === 'failed' ? 500 : 200 });
}

async function safeSend(): Promise<SendResult> {
  try { return await sendWeeklyBrief(); } catch (e) { return { status: 'failed', error: (e as Error).message.slice(0, 300) }; }
}
