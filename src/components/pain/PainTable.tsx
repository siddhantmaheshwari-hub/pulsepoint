'use client';
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { computeTrend, type Trend } from '@/lib/trends';
import { SOURCE_LABEL, type SourceId, type TopicMetricRow } from '@/lib/types';
import { Sufficiency } from '../ui/bits';
import { TREND_META, TrendTag } from '../ui/Trend';
import { Sparkline } from '../viz/Sparkline';
import { EvidenceDrawer } from './EvidenceDrawer';

export interface PainTableProps {
  metrics: TopicMetricRow[]; sparks: Record<string, (number | null)[]>; sparkLabels: string[];
  topics: Record<string, string>; periodStart: string; compare: boolean; variant?: 'full' | 'compact'; limit?: number;
  /** 'period' for the Month / Range views; wording only. */
  unit?: 'week' | 'period';
}
type SortKey = 'current' | 'change' | 'label' | 'unresolved';

export function PainTable({ metrics, sparks, sparkLabels, topics, periodStart, compare, variant = 'full', limit, unit = 'week' }: PainTableProps) {
  const [source, setSource] = useState<'all' | SourceId>('all');
  const [topic, setTopic] = useState('all');
  const [trend, setTrend] = useState<'all' | Trend>('all');
  const [under, setUnder] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'current', dir: -1 });
  const pad = variant === 'compact' ? 'py-2.5' : 'py-3.5';
  const [open, setOpen] = useState<TopicMetricRow | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const sources = useMemo(() => [...new Set(metrics.flatMap((m) => Object.keys(m.by_source)))] as SourceId[], [metrics]);
  const topicSlugs = useMemo(() => [...new Set(metrics.map((m) => m.topic_slug).filter(Boolean))] as string[], [metrics]);

  const rows = useMemo(() => {
    const r = metrics.map((m) => {
      if (source === 'all') return m;
      const s = m.by_source[source] ?? { current: 0, previous: 0 };
      const t = computeTrend(s.current, s.previous); // same deterministic rules, per source
      return { ...m, current_count: t.current, previous_count: t.previous, abs_change: t.absChange, pct_change: t.pctChange, trend: t.trend };
    })
      .filter((m) => m.trend !== 'none' || m.bug_reports > 0)
      .filter((m) => topic === 'all' || m.topic_slug === topic)
      .filter((m) => trend === 'all' || m.trend === trend)
      .filter((m) => !under || m.underserved);
    const val = (m: TopicMetricRow) => sort.key === 'current' ? m.current_count : sort.key === 'change' ? m.abs_change : sort.key === 'unresolved' ? m.unresolved_count : 0;
    r.sort((a, b) => sort.key === 'label' ? a.label.localeCompare(b.label) * sort.dir : (val(a) - val(b)) * sort.dir || b.current_count - a.current_count);
    return limit ? r.slice(0, limit) : r;
  }, [metrics, source, topic, trend, under, sort, limit]);

  const max = Math.max(1, ...rows.map((r) => Math.max(r.current_count, compare ? r.previous_count : 0)));
  const sortBtn = (key: SortKey, label: string, align = 'text-right') => (
    <th scope="col" className={`px-3 py-3 font-medium ${align}`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'label' ? 1 : -1 }))}>
        {label}{sort.key === key && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div>
      {variant === 'full' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pt-source">Source</label>
          <select id="pt-source" className="field" value={source} onChange={(e) => setSource(e.target.value as 'all' | SourceId)}>
            <option value="all">All sources</option>{sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
          <label className="sr-only" htmlFor="pt-topic">Topic</label>
          <select id="pt-topic" className="field" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="all">All topics</option>{topicSlugs.map((t) => <option key={t} value={t}>{topics[t] ?? t}</option>)}
          </select>
          <div role="group" aria-label="Trend" className="flex flex-wrap gap-1 rounded-full border border-line bg-panel p-1">
            {(['all', 'rising', 'new', 'stable', 'declining', 'gone'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={trend === t} onClick={() => setTrend(t)}
                className={`h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors ${trend === t ? 'bg-coal text-coal-text' : 'text-ink-muted hover:text-ink'}`}>
                {t === 'all' ? 'All' : TREND_META[t].label}
              </button>
            ))}
          </div>
          <label className="pill cursor-pointer"><input type="checkbox" className="accent-violet" checked={under} onChange={(e) => setUnder(e.target.checked)} />Underserved only</label>
          {(source !== 'all' || topic !== 'all' || trend !== 'all' || under) && <button type="button" className="pill-quiet" onClick={() => { setSource('all'); setTopic('all'); setTrend('all'); setUnder(false); }}>Clear filters</button>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-panel border border-dashed border-line-strong px-6 py-8 text-center text-sm text-ink-muted">No pain points match these filters.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-panel border border-line bg-panel">
          <table className={`w-full text-[14px] ${variant === 'full' ? 'min-w-[760px]' : 'sm:min-w-[520px]'}`}>
            <caption className="sr-only">Pain points ranked by unique discussions. Select a row to see evidence.</caption>
            <thead className="border-b border-line text-left text-[12px] text-ink-muted">
              <tr>
                {sortBtn('label', 'Pain point', 'text-left pl-5')}
                {sortBtn('current', unit === 'week' ? 'This week' : 'This period')}
                {compare && variant === 'full' && <th scope="col" className="px-3 py-3 text-right font-medium">Previous</th>}
                {compare && sortBtn('change', 'Change')}
                <th scope="col" className={`px-3 py-3 pr-5 font-medium ${variant === 'compact' ? 'hidden sm:table-cell' : ''}`}>8 weeks</th>
                {variant === 'full' && sortBtn('unresolved', 'Unresolved')}
                {variant === 'full' && <th scope="col" className="px-3 py-3 pr-5 font-medium">Evidence</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => {
                const recurring = m.first_observed ? Date.parse(m.first_observed) < Date.parse(periodStart) : false;
                return (
                  <tr key={m.pain_point_key} className="group cursor-pointer transition-colors hover:bg-[#FAF8F3]" onClick={() => setOpen(m)}>
                    <th scope="row" className={`max-w-[340px] ${pad} pl-4 sm:pl-5 pr-3 text-left font-normal`}>
                      <button type="button" className="block w-full text-left" onClick={(e) => { e.stopPropagation(); setOpen(m); }}>
                        <span className="block truncate font-medium text-ink group-hover:text-violet-ink">{m.label}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-ink-muted">
                          <span>{(m.topic_slug && topics[m.topic_slug]) ?? 'Uncategorised'}</span>
                          <span>{recurring ? 'Recurring' : `First seen this ${unit}`}</span>
                          {m.underserved && <span className="font-medium text-rise">Underserved</span>}
                          {m.bug_reports > 0 && <span>{m.bug_reports} isolated bug{m.bug_reports === 1 ? '' : 's'}</span>}
                        </span>
                      </button>
                    </th>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <span className="relative hidden h-1.5 w-16 rounded-full bg-sunk sm:block" aria-hidden="true">
                          {compare && <span className="absolute inset-y-0 left-0 rounded-full border border-ink-faint/50" style={{ width: `${(m.previous_count / max) * 100}%` }} />}
                          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(m.current_count / max) * 100}%`, background: TREND_META[m.trend].fill }} />
                        </span>
                        <span className="whitespace-nowrap text-right"><span className="block text-[16px] font-semibold tabular-nums">{m.current_count}</span>{compare && variant === 'compact' && <span className="block text-[11px] tabular-nums text-ink-faint">vs {m.previous_count}</span>}</span>
                      </div>
                    </td>
                    {compare && variant === 'full' && <td className="px-3 py-3.5 text-right tabular-nums text-ink-muted">{m.previous_count}</td>}
                    {compare && <td className="whitespace-nowrap px-3 py-3.5 text-right">{variant === 'full' && <span className="mr-2 text-xs tabular-nums text-ink-muted">{m.abs_change > 0 ? '+' : ''}{m.abs_change}</span>}<TrendTag trend={m.trend} pct={m.pct_change} size="sm" /></td>}
                    <td className={`px-3 py-3.5 pr-5 ${variant === 'compact' ? 'hidden sm:table-cell' : ''}`}><Sparkline values={sparks[m.pain_point_key] ?? []} color={TREND_META[m.trend].fill === '#C9C5BB' ? '#8E939B' : TREND_META[m.trend].fill} label={`${m.label} weekly history`} /></td>
                    {variant === 'full' && <td className="px-3 py-3.5 text-right tabular-nums">{m.unresolved_count}<span className="text-ink-faint">/{m.current_count}</span></td>}
                    {variant === 'full' && <td className="px-3 py-3.5 pr-5"><Sufficiency value={m.sufficiency} /><span className="block text-[11px] text-ink-faint">{m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}{m.verified_share !== null ? `, ${Math.round(m.verified_share * 100)}% verified` : ''}</span></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <EvidenceDrawer m={open} history={sparks[open.pain_point_key] ?? []} labels={sparkLabels} topicName={open.topic_slug ? topics[open.topic_slug] ?? null : null} periodStart={periodStart} compare={compare} unit={unit} onClose={close} />}
    </div>
  );
}
