import Link from 'next/link';
import { SetupNotice } from '@/components/SetupNotice';
import { Empty, PageHeader } from '@/components/ui/bits';
import { TrendTag } from '@/components/ui/Trend';
import { missingEnv } from '@/lib/env';
import { fmtDateTime, fmtPeriod } from '@/lib/format';
import { one, type SP } from '@/lib/params';
import { getMetrics, listReports } from '@/lib/queries';
import { computeTrend } from '@/lib/trends';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const reports = await listReports();
  if (!reports.length) return <><PageHeader title="Weekly reports" /><Empty title="No reports yet">Each Friday brief is stored here as a permanent snapshot.</Empty></>;

  const latestPer = new Map<string, (typeof reports)[number]>();
  for (const r of reports) if (!latestPer.has(r.period_end)) latestPer.set(r.period_end, r);
  const weeks = [...latestPer.values()];
  const aId = one(sp.a) ?? weeks[0]?.id, bId = one(sp.b) ?? weeks[1]?.id;
  const a = reports.find((r) => r.id === aId), b = reports.find((r) => r.id === bId);
  const [ma, mb] = await Promise.all([a ? getMetrics(a.id) : [], b ? getMetrics(b.id) : []]);
  const keys = new Map<string, string>();
  for (const m of [...ma, ...mb]) keys.set(m.pain_point_key, m.label);
  const comp = [...keys].map(([k, label]) => {
    const ca = ma.find((m) => m.pain_point_key === k)?.current_count ?? 0, cb = mb.find((m) => m.pain_point_key === k)?.current_count ?? 0;
    return { k, label, t: computeTrend(ca, cb) };
  }).filter((x) => x.t.trend !== 'none').sort((x, y) => y.t.current - x.t.current || y.t.absChange - x.t.absChange);
  const keep = one(sp.compare) ? `&compare=${one(sp.compare)}` : '';

  return (
    <div>
      <PageHeader title="Weekly reports" lead="Every brief is an immutable snapshot. Regenerating a week adds a new version; earlier versions stay readable." />
      <section className="panel panel-pad mb-8" aria-labelledby="cmp-h">
        <h2 id="cmp-h" className="h-panel">Compare two weeks</h2>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          {one(sp.compare) && <input type="hidden" name="compare" value={one(sp.compare)} />}
          <label className="text-xs text-ink-muted">Week A<select name="a" defaultValue={aId} className="field mt-1 block">{weeks.map((w) => <option key={w.id} value={w.id}>{fmtPeriod(w.period_start, w.period_end, false)}</option>)}</select></label>
          <label className="text-xs text-ink-muted">Week B<select name="b" defaultValue={bId} className="field mt-1 block">{weeks.map((w) => <option key={w.id} value={w.id}>{fmtPeriod(w.period_start, w.period_end, false)}</option>)}</select></label>
          <button className="pill-dark">Compare</button>
        </form>
        {a && b && a.id !== b.id ? (
          <div className="relative mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-muted"><tr><th className="py-2 font-medium">Pain point</th><th className="py-2 text-right font-medium">A: {fmtPeriod(a.period_start, a.period_end, false)}</th><th className="py-2 text-right font-medium">B: {fmtPeriod(b.period_start, b.period_end, false)}</th><th className="py-2 pl-4 font-medium">A vs B</th></tr></thead>
              <tbody className="divide-y divide-line">{comp.map((x) => <tr key={x.k}><td className="py-2.5">{x.label}</td><td className="py-2.5 text-right font-semibold tabular-nums">{x.t.current}</td><td className="py-2.5 text-right tabular-nums text-ink-muted">{x.t.previous}</td><td className="py-2.5 pl-4"><TrendTag trend={x.t.trend} pct={x.t.pctChange} size="sm" /></td></tr>)}</tbody>
            </table>
            <p className="meta mt-3">Counts come from each week’s stored snapshot, so later revisions don’t change them.</p>
          </div>
        ) : <p className="mt-4 text-sm text-ink-muted">Pick two different weeks.</p>}
      </section>

      <div className="relative overflow-x-auto rounded-panel border border-line bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-muted"><tr><th className="px-5 py-3 font-medium">Week</th><th className="px-3 py-3 font-medium">Version</th><th className="px-3 py-3 font-medium">Generated</th><th className="px-3 py-3 text-right font-medium">Pain discussions</th><th className="px-3 py-3 text-right font-medium">Rising</th><th className="px-3 py-3 text-right font-medium">New</th><th className="px-5 py-3 font-medium">AI summary</th></tr></thead>
          <tbody className="divide-y divide-line">
            {reports.map((r) => (
              <tr key={r.id} className="hover:bg-[#FAF8F3]">
                <td className="px-5 py-3"><Link href={`/?report=${r.id}${keep}`} className="font-medium hover:text-violet-ink">{fmtPeriod(r.period_start, r.period_end)}</Link></td>
                <td className="px-3 py-3 text-ink-muted">v{r.version}, {r.trigger === 'manual' ? 'manual' : 'scheduled'}</td>
                <td className="px-3 py-3 text-ink-muted">{fmtDateTime(r.generated_at)}</td>
                <td className="px-3 py-3 text-right tabular-nums"><span className="font-semibold">{r.totals.pain_discussions}</span><span className="text-ink-faint"> / {r.totals.pain_discussions_previous}</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{r.totals.rising}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.totals.new}</td>
                <td className="px-5 py-3 text-ink-muted">{r.status === 'complete' ? 'Included' : 'Unavailable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
