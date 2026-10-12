import 'server-only';
import { NextResponse } from 'next/server';
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

  const result = await runPipeline(trigger, mode);

  // Weekly: email the brief once the report exists (also covers a report saved by an earlier weekly attempt).
  if (trigger === 'cron_weekly') email = await safeSend();
  if (email) console.info(`[email] ${email.status}${email.error ? `: ${email.error}` : ''}`);
  return NextResponse.json({ ...result, email }, { status: result.status === 'failed' ? 500 : 200 });
}

async function safeSend(): Promise<SendResult> {
  try { return await sendWeeklyBrief(); } catch (e) { return { status: 'failed', error: (e as Error).message.slice(0, 300) }; }
}
