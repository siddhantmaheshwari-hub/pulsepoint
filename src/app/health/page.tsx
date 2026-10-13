import { GenerateButton } from '@/components/shell/GenerateButton';
import { SetupNotice } from '@/components/SetupNotice';
import { PageHeader } from '@/components/ui/bits';
import { SegmentBar } from '@/components/viz/SegmentBar';
import { missingEnv } from '@/lib/env';
import { fmtDate, fmtDateTime, timeAgo } from '@/lib/format';
import { getFreshness, getHealthTotals, listRuns, type RunRow } from '@/lib/queries';
export const metadata = { title: 'System health' };

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  succeeded: { dot: 'bg-fall-fill', text: 'text-fall', label: 'Succeeded' }, partial: { dot: 'bg-fresh-fill', text: 'text-fresh', label: 'Partial' },
  failed: { dot: 'bg-rise-fill', text: 'text-rise', label: 'Failed' }, running: { dot: 'bg-violet', text: 'text-violet-ink', label: 'Running' }, skipped: { dot: 'bg-ink-faint', text: 'text-ink-muted', label: 'Skipped' },
};
const TRIGGER: Record<string, string> = { cron_daily: 'Daily schedule', cron_weekly: 'Friday schedule', manual: 'Manual' };

export default async function HealthPage() {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const [runs, t, f] = await Promise.all([listRuns(30), getHealthTotals(), getFreshness()]);
  const lastFailed = runs.find((r) => r.status === 'failed');
  return (
    <div>
      <PageHeader title="System health" lead="Is the pipeline collecting, analysing and reporting as expected? Partial runs resume automatically on the next run.">
        <GenerateButton mode="collect" variant="light" />
      </PageHeader>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Last successful collection" value={timeAgo(f.last_success)} sub={f.last_success ? fmtDateTime(f.last_success) : 'No run has completed yet'} />
        <Stat label="Waiting for analysis" value={String(t.queued)} sub={t.gave_up ? `${t.gave_up} gave up after 3 attempts` : 'Processed on the next run'} warn={t.queued > 0} />
        <Stat label="History stored" value={`${t.weeks} wk`} sub={t.first_data ? `Data since ${fmtDate(t.first_data, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No data yet'} />
        <Stat label="Duplicates excluded" value={String(t.duplicates)} sub="Cross-posts matched by content fingerprint" />
      </section>

      <section className="panel panel-pad mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="h-panel">Analysis coverage, all time</h2><span className="meta">{t.discussions} unique discussions</span></div>
        <div className="mt-4"><SegmentBar segments={[
          { label: 'Analysed', value: t.analyzed, className: 'bg-coal text-coal-text' },
          { label: 'Queued', value: t.queued, className: 'bg-sunk text-ink-muted', hatch: true },
          { label: 'Gave up', value: t.gave_up, className: 'bg-rise-soft text-rise' },
        ]} /></div>
        <p className="meta mt-3">{t.pain_points} distinct pain points catalogued · {t.reports} reports stored ({t.weeks} weeks)</p>
      </section>

      <section className="mt-6 overflow-hidden rounded-panel bg-coal text-coal-text" aria-labelledby="runs-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pb-3 pt-5"><h2 id="runs-h" className="text-[15px] font-semibold">Run log</h2><span className="text-xs text-coal-muted">{lastFailed ? `Last failure ${timeAgo(lastFailed.started_at)}` : 'No failed runs'}</span></div>
        {runs.length ? <ol className="divide-y divide-coal-3">{runs.map((r) => <RunItem key={r.id} r={r} />)}</ol> : <p className="px-6 pb-6 text-sm text-coal-muted">No runs yet.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return <div className="panel p-5"><p className="meta">{label}</p><p className={`mt-2 text-[30px] font-light leading-none tracking-[-0.03em] ${warn ? 'text-fresh' : ''}`}>{value}</p><p className="meta mt-2">{sub}</p></div>;
}

function RunItem({ r }: { r: RunRow }) {
  const s = STATUS[r.status] ?? STATUS.skipped;
  const c = r.stats.collect as { sources?: Record<string, { requests: number; failures: number; items: number; skipped?: string }>; newDiscussions?: number; duplicatesFlagged?: number } | undefined;
  const a = r.stats.analyze as { analyzed: number; relevant: number; failed: number; remaining: number; quotesRejected: number } | undefined;
  const rep = r.stats.report as { reportId?: string; skipped?: string } | undefined;
  return (
    <li className="px-6 py-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" /><span className="font-medium text-coal-text">{s.label}</span>
        <span className="text-coal-muted">{TRIGGER[r.trigger] ?? r.trigger}, {r.mode}</span>
        <span className="ml-auto text-coal-muted">{fmtDateTime(r.started_at)}{r.stats.duration_ms ? `, ${Math.round(Number(r.stats.duration_ms) / 1000)} s` : ''}</span>
      </div>
      <div className="mt-1.5 space-y-0.5 pl-5 text-coal-muted">
        {c && <p>{Object.entries(c.sources ?? {}).map(([k, v]) => `${k}: ${v.skipped ? `skipped (${v.skipped})` : `${v.items} items${v.failures ? `, ${v.failures}/${v.requests} failed` : ''}`}`).join(' · ')} · {c.newDiscussions ?? 0} new · {c.duplicatesFlagged ?? 0} duplicates</p>}
        {a && <p>Analysis: {a.analyzed} analysed, {a.relevant} relevant{a.failed ? `, ${a.failed} failed` : ''}{a.quotesRejected ? `, ${a.quotesRejected} unverifiable quotes removed` : ''}{a.remaining ? `, ${a.remaining} still queued` : ''}</p>}
        {rep?.reportId && <p>Report generated</p>}{rep?.skipped && <p>{rep.skipped}</p>}
      </div>
      {r.errors.length > 0 && (
        <details className="mt-2 pl-5"><summary className="cursor-pointer text-[#F08A6A]">{r.errors.length} issue{r.errors.length === 1 ? '' : 's'}</summary>
          <ul className="mt-1.5 space-y-1 text-xs text-coal-muted">{r.errors.slice(0, 15).map((e, i) => <li key={i}><span className="text-coal-text">{e.stage}{e.source ? ` / ${e.source}` : ''}:</span> {e.message}</li>)}</ul></details>
      )}
    </li>
  );
}
