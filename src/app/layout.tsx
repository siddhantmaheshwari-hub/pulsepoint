import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Suspense } from 'react';
import './globals.css';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar, type FreshnessView, type PeriodOpt } from '@/components/shell/TopBar';
import { missingEnv } from '@/lib/env';
import { fmtPeriod, timeAgo } from '@/lib/format';
import { getFreshness, listPeriods } from '@/lib/queries';

export const metadata: Metadata = { title: 'PulsePoint', description: 'Developer community intelligence: weekly pain points, trends and evidence.' };
export const dynamic = 'force-dynamic';

function nextFridayBrief(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const target = new Date(ist);
  const add = (5 - ist.getUTCDay() + 7) % 7;
  target.setUTCDate(ist.getUTCDate() + add);
  target.setUTCHours(6, 0, 0, 0);
  if (target <= ist) target.setUTCDate(target.getUTCDate() + 7);
  return `${new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(target)}, 06:00 IST`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let periods: PeriodOpt[] = [];
  let fresh: FreshnessView = { label: 'Not connected', tone: 'none', detail: 'Environment variables are missing' };
  if (!missingEnv().length) {
    try {
      const [p, f] = await Promise.all([listPeriods(), getFreshness()]);
      periods = p.map((x) => ({ id: x.id, label: fmtPeriod(x.period_start, x.period_end, false) }));
      const stale = f.last_success ? Date.now() - Date.parse(f.last_success) > 36 * 3_600_000 : true;
      fresh = !f.last_started ? { label: 'No collection yet', tone: 'none', detail: 'Run Generate report to collect discussions' }
        : f.last_status === 'failed' ? { label: 'Last run failed', tone: 'bad', detail: 'Open System health for details' }
        : { label: `Collected ${timeAgo(f.last_success)}`, tone: f.last_status === 'partial' || stale ? 'warn' : 'ok', detail: `${f.queued} queued for analysis · last run ${f.last_status}` };
    } catch {
      fresh = { label: 'Database unreachable', tone: 'bad', detail: 'Check DATABASE_URL' };
    }
  }

  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <div className="contents" data-print-hide><Suspense><Sidebar nextBrief={nextFridayBrief()} /></Suspense></div>
          <div className="min-w-0 flex-1 lg:py-3 lg:pr-3">
            <div className="flex min-h-[calc(100vh-24px)] flex-col rounded-t-sheet bg-paper shadow-sheet lg:rounded-sheet">
              <div className="contents" data-print-hide><Suspense><TopBar periods={periods} freshness={fresh} /></Suspense></div>
              <main id="main" className="flex-1 px-5 pb-16 pt-8 md:px-8 lg:px-10">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
