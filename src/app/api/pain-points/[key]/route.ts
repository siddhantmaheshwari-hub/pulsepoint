import { NextResponse } from 'next/server';
import { db, must } from '@/lib/db';

export const dynamic = 'force-dynamic';

// History of one pain point across stored weekly report snapshots.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(key)) return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  const rows = must(await db().from('topic_metrics').select('current_count, trend, reports!inner(id, period_end, version, generated_at)').eq('pain_point_key', key).order('period_end', { referencedTable: 'reports', ascending: false }).limit(60), 'load history') as unknown as { current_count: number; trend: string; reports: { id: string; period_end: string; version: number } }[];
  // Keep the latest version per period
  const byPeriod = new Map<string, { period_end: string; count: number; trend: string }>();
  for (const r of rows.sort((a, b) => b.reports.version - a.reports.version)) {
    if (!byPeriod.has(r.reports.period_end)) byPeriod.set(r.reports.period_end, { period_end: r.reports.period_end, count: r.current_count, trend: r.trend });
  }
  return NextResponse.json({ key, history: [...byPeriod.values()].sort((a, b) => a.period_end.localeCompare(b.period_end)).slice(-12) });
}
