import { SetupNotice } from '@/components/SetupNotice';
import { PageHeader, SourceChip } from '@/components/ui/bits';
import { TrendTag } from '@/components/ui/Trend';
import { SegmentBar } from '@/components/viz/SegmentBar';
import { missingEnv } from '@/lib/env';
import { fmtDateTime, fmtPeriod } from '@/lib/format';
import { compareOn, one, type SP } from '@/lib/params';
import { getReport, getSourceBreakdown, listRuns, windowFor } from '@/lib/queries';
import { computeTrend } from '@/lib/trends';
import { toggleSource } from '../topics/actions';

const NOTE: Record<string, string> = {
  hackernews: 'Official Algolia search API. Stories and comments are folded into one thread per discussion.',
  stackoverflow: 'Official Stack Exchange API. Skews toward how-to questions, which are classified separately from pain.',
  github: 'GitHub Issues search. Needs GITHUB_TOKEN. Dominated by repo-specific bugs, so off by default.',
};

export default async function SourcesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const compare = compareOn(sp);
  const report = await getReport(one(sp.report));
  const w = windowFor(report);
  const [rows, runs] = await Promise.all([getSourceBreakdown({ period_start: w.start, period_end: w.end, prev_period_start: w.prevStart }), listRuns(14)]);
  const health = new Map<string, { req: number; fail: number; lastError?: string; lastAt?: string }>();
  for (const r of runs) {
    for (const [s, v] of Object.entries((r.stats.collect as { sources?: Record<string, { requests: number; failures: number }> } | undefined)?.sources ?? {})) {
      const h = health.get(s) ?? { req: 0, fail: 0 }; h.req += v.requests; h.fail += v.failures; health.set(s, h);
    }
    for (const e of r.errors) if (e.source) { const h = health.get(e.source) ?? { req: 0, fail: 0 }; if (!h.lastError) { h.lastError = e.message; h.lastAt = r.started_at; } health.set(e.source, h); }
  }
  const totalPain = rows.reduce((a, r) => a + r.cur_pain, 0);

  return (
    <div>
      <PageHeader title="Sources" lead={<>Where discussions come from{report ? ` for ${fmtPeriod(w.start, w.end)}` : ''}, and how reliably each source answered over the last {runs.length} collection runs. Only official APIs are used.</>} />
      <div className="panel panel-pad mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="h-panel">Share of pain discussions</h2><span className="meta">{totalPain} this week</span></div>
        <div className="mt-4"><SegmentBar segments={rows.filter((r) => r.cur_pain).map((r, i) => ({ label: r.name, value: r.cur_pain, className: ['bg-coal text-coal-text', 'bg-teal text-ink', 'bg-sunk text-ink-2'][i] ?? 'bg-sunk' }))} /></div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">{rows.filter((r) => r.cur_pain).map((r, i) => <li key={r.id} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${['bg-coal', 'bg-teal', 'bg-sunk'][i]}`} aria-hidden="true" />{r.name}</li>)}</ul>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const h = health.get(r.id), rate = h && h.req ? h.fail / h.req : null, tr = computeTrend(r.cur_collected, r.prev_collected), pt = computeTrend(r.cur_pain, r.prev_pain);
          return (
            <article key={r.id} className={`panel flex flex-col p-6 ${r.is_enabled ? '' : 'border-dashed bg-paper'}`}>
              <div className="flex items-start justify-between gap-3">
                <div><SourceChip id={r.id} full />{!r.is_enabled && <span className="tag ml-2 h-5 bg-sunk px-2 text-[11px] text-ink-2">Paused</span>}<p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{NOTE[r.id]}</p></div>
                <form action={toggleSource}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="enabled" value={String(!r.is_enabled)} />
                  <button className="pill h-8 shrink-0" aria-label={`${r.is_enabled ? 'Pause' : 'Enable'} ${r.name}`}>{r.is_enabled ? 'Pause' : 'Enable'}</button></form>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-5">
                <div><dt className="meta">Collected this week</dt><dd className="mt-1 flex items-center gap-2"><span className="text-[30px] font-light leading-none">{r.cur_collected}</span>{compare && <TrendTag trend={tr.trend} pct={tr.pctChange} size="sm" />}</dd>{compare && <dd className="meta mt-1">{r.prev_collected} the week before</dd>}</div>
                <div><dt className="meta">Describing pain</dt><dd className="mt-1 flex items-center gap-2"><span className="text-[30px] font-light leading-none">{r.cur_pain}</span>{compare && <TrendTag trend={pt.trend} pct={pt.pctChange} size="sm" />}</dd>{compare && <dd className="meta mt-1">{r.prev_pain} the week before</dd>}</div>
              </dl>
              <div className="mt-auto border-t border-line pt-4 text-[13px]">
                {!r.is_enabled ? <p className="text-ink-muted">Paused — not collected on the next runs.</p>
                  : rate === null ? <p className="text-ink-muted">No runs recorded yet.</p>
                  : <p className={rate > 0 ? 'text-rise' : 'text-fall'}>{h!.fail ? `${h!.fail} of ${h!.req} requests failed recently` : `All ${h!.req} recent requests succeeded`}</p>}
                {h?.lastError && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">Last error {fmtDateTime(h.lastAt)}: {h.lastError}</p>}
                <p className="meta mt-1">Up to {r.max_items} items per keyword per run</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="meta mt-6 max-w-3xl">Reddit isn’t connected: its API requires OAuth registration and restricts commercial use. Discord and private Slack communities are out of scope.</p>
    </div>
  );
}
