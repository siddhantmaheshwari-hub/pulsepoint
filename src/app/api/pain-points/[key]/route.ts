import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// History of one pain point across stored weekly snapshots (latest version per week).
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(key)) return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  const history = await db()<{ period_end: string; count: number; trend: string }[]>`
    select period_end, count, trend from (
      select distinct on (r.period_end) r.period_end, m.current_count as count, m.trend
      from topic_metrics m join reports r on r.id = m.report_id
      where m.pain_point_key = ${key}
      order by r.period_end desc, r.version desc
      limit 12
    ) h order by period_end`;
  return NextResponse.json({ key, history });
}
