import Link from 'next/link';
import { SetupNotice } from '@/components/SetupNotice';
import { missingEnv } from '@/lib/env';
import { fmtDateTime, fmtPeriod } from '@/lib/format';
import { listReports } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const reports = await listReports();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Report history</h1>
      <p className="mt-1 text-sm text-muted">Every brief is stored as an immutable snapshot. Regenerating a week creates a new version; older versions stay readable.</p>
      {reports.length === 0 ? <p className="mt-6 text-sm text-muted">No reports yet. Generate one from the <Link href="/">Friday brief</Link>.</p> : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr><th className="px-4 py-2 font-medium">Week</th><th className="px-4 py-2 font-medium">Version</th><th className="px-4 py-2 font-medium">Generated</th><th className="px-4 py-2 text-right font-medium">Pain discussions</th><th className="px-4 py-2 text-right font-medium">Rising</th><th className="px-4 py-2 text-right font-medium">New</th><th className="px-4 py-2 font-medium">AI summary</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5"><Link href={`/?report=${r.id}`}>{fmtPeriod(r.period_start, r.period_end)}</Link></td>
                  <td className="px-4 py-2.5">v{r.version} · {r.trigger === 'manual' ? 'manual' : 'scheduled'}</td>
                  <td className="px-4 py-2.5 text-muted">{fmtDateTime(r.generated_at)}</td>
                  <td className="px-4 py-2.5 text-right">{r.totals.pain_discussions} <span className="text-muted">vs {r.totals.pain_discussions_previous}</span></td>
                  <td className="px-4 py-2.5 text-right">{r.totals.rising}</td>
                  <td className="px-4 py-2.5 text-right">{r.totals.new}</td>
                  <td className="px-4 py-2.5 text-muted">{r.status === 'complete' ? 'Included' : 'Unavailable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
