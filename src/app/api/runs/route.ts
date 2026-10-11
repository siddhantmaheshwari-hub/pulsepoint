import { NextResponse } from 'next/server';
import { z } from 'zod';
import { missingEnv } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const body = z.object({ mode: z.enum(['collect', 'report', 'full']) });

// Manual trigger from the dashboard (protected by Basic auth in middleware).
export async function POST(req: Request) {
  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: `Missing environment variables: ${missing.join(', ')}` }, { status: 500 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'mode must be collect, report or full' }, { status: 400 });
  const result = await runPipeline('manual', parsed.data.mode);
  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
}
