import { RunButton } from '@/components/RunButton';
import { SetupNotice } from '@/components/SetupNotice';
import { missingEnv } from '@/lib/env';
import { fmtDateTime } from '@/lib/format';
import { listRuns } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { succeeded: 'text-calm', partial: 'text-signal', failed: 'text-signal', running: 'text-steel', skipped: 'text-muted' };

export default async function RunsPage() {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const runs = await listRuns();
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Collection status</h1>
          <p className="mt-1 text-sm text-muted">Daily collection runs at 06:30 IST; the Friday brief is built at 08:00 IST. Partial means some requests failed or analysis is still queued — the next run resumes it.</p>
        </div>
        <RunButton mode="collect" />
      </div>
      <ul className="mt-6 space-y-3">
        {runs.map((r) => {
          const c = r.stats.collect as { sources?: Record<string, { requests: number; failures: number; items: number; skipped?: string }>; newDiscussions?: number; duplicatesFlagged?: number; droppedNoMatch?: number } | undefined;
          const a = r.stats.analyze as { analyzed: number; relevant: number; failed: number; remaining: number; quotesRejected: number } | undefined;
          return (
            <li key={r.id} className="rounded-lg border border-line bg-panel p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p><span className={`font-semibold capitalize ${STATUS[r.status] ?? ''}`}>{r.status}</span> · {r.trigger.replace('_', ' ')} · {r.mode}</p>
                <p className="text-xs text-muted">{fmtDateTime(r.started_at)}{r.stats.duration_ms ? ` · ${Math.round(Number(r.stats.duration_ms) / 1000)}s` : ''}</p>
              </div>
              {c && (
                <p className="mt-2 text-muted">
                  {Object.entries(c.sources ?? {}).map(([s, v]) => `${s}: ${v.skipped ? `skipped (${v.skipped})` : `${v.items} items, ${v.failures}/${v.requests} failed`}`).join(' · ')}
                  {` · ${c.newDiscussions ?? 0} new · ${c.duplicatesFlagged ?? 0} duplicates · ${c.droppedNoMatch ?? 0} fuzzy matches dropped`}
                </p>
              )}
              {a && <p className="mt-1 text-muted">Analysis: {a.analyzed} analyzed, {a.relevant} relevant, {a.failed} failed, {a.quotesRejected} unverifiable quotes removed, {a.remaining} queued</p>}
              {r.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-signal">{r.errors.length} issue{r.errors.length === 1 ? '' : 's'}</summary>
                  <ul className="mt-2 space-y-1 text-xs">{r.errors.slice(0, 20).map((e, i) => <li key={i}><span className="font-medium">{e.stage}{e.source ? ` / ${e.source}` : ''}:</span> {e.message}</li>)}</ul>
                </details>
              )}
            </li>
          );
        })}
        {runs.length === 0 && <li className="text-sm text-muted">No runs yet.</li>}
      </ul>
    </div>
  );
}
