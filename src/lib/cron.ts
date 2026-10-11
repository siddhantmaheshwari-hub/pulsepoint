import 'server-only';
import { NextResponse } from 'next/server';
import { env, missingEnv } from './env';
import { runPipeline, type Mode, type Trigger } from './pipeline/run';

export async function handleCron(req: Request, trigger: Trigger, mode: Mode) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: `Missing environment variables: ${missing.join(', ')}` }, { status: 500 });
  const result = await runPipeline(trigger, mode);
  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
}
