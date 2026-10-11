'use client';
import { useEffect, useMemo, useState } from 'react';
import { fmtDate } from '@/lib/format';
import { computeTrend, type Trend } from '@/lib/trends';
import { SOURCE_LABEL, type SourceId, type TopicMetricRow } from '@/lib/types';
import { TREND_STYLE, TrendMark } from './TrendMark';

type Filter = { source: 'all' | SourceId; topic: string; trend: 'all' | Trend; underservedOnly: boolean };

const SUFF: Record<string, string> = { sufficient: 'Enough data', limited: 'Limited data', insufficient: 'Too little data' };

export function PulseLadder({ metrics, topics, periodLabel }: { metrics: TopicMetricRow[]; topics: { slug: string; name: string }[]; periodLabel: string }) {
  const [f, setF] = useState<Filter>({ source: 'all', topic: 'all', trend: 'all', underservedOnly: false });
  const [open, setOpen] = useState<TopicMetricRow | null>(null);
  const sources = useMemo(() => [...new Set(metrics.flatMap((m) => Object.keys(m.by_source)))] as SourceId[], [metrics]);

  const rows = useMemo(() => metrics
    .map((m) => {
      if (f.source === 'all') return m;
      const s = m.by_source[f.source] ?? { current: 0, previous: 0 };
      const t = computeTrend(s.current, s.previous);
      return { ...m, current_count: t.current, previous_count: t.previous, abs_change: t.absChange, pct_change: t.pctChange, trend: t.trend };
    })
    .filter((m) => m.trend !== 'none')
    .filter((m) => f.topic === 'all' || m.topic_slug === f.topic)
    .filter((m) => f.trend === 'all' || m.trend === f.trend)
    .filter((m) => !f.underservedOnly || m.underserved)
    .sort((a, b) => b.current_count - a.current_count || b.abs_change - a.abs_change), [metrics, f]);

  const max = Math.max(1, ...rows.map((r) => Math.max(r.current_count, r.previous_count)));

  return (
    <section aria-labelledby="ladder-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ladder-h" className="h-section">Pain points by unique discussions</h2>
          <p className="mt-0.5 text-xs text-muted">Solid bar: {periodLabel}. Outline: previous 7 days. Counts and trends are computed by code, not AI.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="sr-only" htmlFor="f-source">Source</label>
          <select id="f-source" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Filter['source'] })}>
            <option value="all">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-topic">Topic</label>
          <select id="f-topic" className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
            <option value="all">All topics</option>
            {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-trend">Trend</label>
          <select id="f-trend" className="input" value={f.trend} onChange={(e) => setF({ ...f, trend: e.target.value as Filter['trend'] })}>
            <option value="all">Any trend</option>
            {(['rising', 'new', 'stable', 'declining', 'gone'] as Trend[]).map((t) => <option key={t} value={t}>{TREND_STYLE[t].label}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5">
            <input type="checkbox" checked={f.underservedOnly} onChange={(e) => setF({ ...f, underservedOnly: e.target.checked })} />
            Underserved only
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line p-6 text-sm text-muted">No pain points match these filters.</p>
      ) : (
        <ol className="mt-4 divide-y divide-line rounded-lg border border-line bg-panel">
          {rows.map((m) => (
            <li key={m.pain_point_key}>
              <button type="button" onClick={() => setOpen(m)} className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-[#F8F9F7] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7.5rem] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.label}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span>{m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}</span>
                    <span>{SUFF[m.sufficiency]}</span>
                    {m.underserved && <span className="font-medium text-signal">Potentially underserved</span>}
                    {m.bug_reports > 0 && <span>{m.bug_reports} isolated bug report{m.bug_reports === 1 ? '' : 's'}</span>}
                  </span>
                </span>
                <span className="relative h-5" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded-sm border border-[#9AA3B0]" style={{ width: `${(m.previous_count / max) * 100}%` }} />
                  <span className="absolute inset-y-1 left-0 rounded-sm" style={{ width: `${(m.current_count / max) * 100}%`, background: TREND_STYLE[m.trend].color }} />
                </span>
                <span className="flex items-baseline justify-between gap-3 md:justify-end">
                  <span className="text-sm"><span className="text-base font-semibold">{m.current_count}</span><span className="text-muted"> vs {m.previous_count}</span></span>
                  <TrendMark trend={m.trend} pct={m.pct_change} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {open && <EvidenceDrawer metric={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function EvidenceDrawer({ metric: m, onClose }: { metric: TopicMetricRow; onClose: () => void }) {
  const [history, setHistory] = useState<{ period_end: string; count: number }[] | null>(null);
  const [histErr, setHistErr] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    fetch(`/api/pain-points/${m.pain_point_key}`).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setHistory(d.history)).catch((e) => setHistErr(e.message));
    return () => window.removeEventListener('keydown', onKey);
  }, [m.pain_point_key, onClose]);
  const hmax = Math.max(1, ...(history ?? []).map((h) => h.count));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="drawer-h" className="h-full w-full max-w-xl overflow-y-auto bg-panel p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="drawer-h" className="text-lg font-semibold">{m.label}</h3>
            <p className="mt-1 text-xs text-muted">Key <code>{m.pain_point_key}</code> · first seen {fmtDate(m.first_observed)} · last seen {fmtDate(m.last_observed)}</p>
          </div>
          <button type="button" className="btn" onClick={onClose} autoFocus>Close</button>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
          <div><dt className="text-muted">This week</dt><dd className="text-lg font-semibold">{m.current_count}</dd></div>
          <div><dt className="text-muted">Previous</dt><dd className="text-lg font-semibold">{m.previous_count}</dd></div>
          <div><dt className="text-muted">Change</dt><dd className="text-lg font-semibold">{m.abs_change > 0 ? '+' : ''}{m.abs_change} <TrendMark trend={m.trend} pct={m.pct_change} /></dd></div>
          <div><dt className="text-muted">Unresolved</dt><dd>{m.unresolved_count} of {m.current_count}</dd></div>
          <div><dt className="text-muted">Avg confidence</dt><dd>{m.avg_confidence ?? '—'}</dd></div>
          <div><dt className="text-muted">Verified quotes</dt><dd>{m.verified_share === null ? '—' : `${Math.round(m.verified_share * 100)}%`}</dd></div>
        </dl>

        <h4 className="mt-6 text-sm font-semibold">Weekly history</h4>
        {histErr && <p className="mt-2 text-xs text-signal">Could not load history: {histErr}</p>}
        {!history && !histErr && <p className="mt-2 text-xs text-muted">Loading…</p>}
        {history && history.length < 2 && <p className="mt-2 text-xs text-muted">History builds up as weekly reports are stored.</p>}
        {history && history.length >= 2 && (
          <div className="mt-2 flex h-20 items-end gap-1.5" role="img" aria-label={`Weekly counts: ${history.map((h) => h.count).join(', ')}`}>
            {history.map((h) => (
              <div key={h.period_end} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-sm bg-steel" style={{ height: `${Math.max(4, (h.count / hmax) * 64)}px` }} />
                <span className="text-[10px] text-muted">{fmtDate(new Date(Date.parse(h.period_end) - 1).toISOString())}</span>
              </div>
            ))}
          </div>
        )}

        <h4 className="mt-6 text-sm font-semibold">Source discussions</h4>
        <p className="text-xs text-muted">Quotes are shown only when verified verbatim against the source text.</p>
        <ul className="mt-3 space-y-4">
          {m.evidence.map((e) => (
            <li key={e.discussion_id} className="border-l-2 border-line pl-3">
              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium">{e.title}</a>
              <p className="mt-0.5 text-xs text-muted">{SOURCE_LABEL[e.source_id]} · {fmtDate(e.created_at)} · {e.resolution_status.replace('_', ' ')} · confidence {e.confidence}</p>
              {e.quote && <blockquote className="mt-1.5 text-sm text-ink/90">“{e.quote}”</blockquote>}
              {e.workaround && <p className="mt-1 text-xs"><span className="text-muted">Workaround mentioned:</span> {e.workaround}</p>}
            </li>
          ))}
          {m.evidence.length === 0 && <li className="text-sm text-muted">No current-week evidence (this pain point appeared only last week).</li>}
        </ul>
      </aside>
    </div>
  );
}
