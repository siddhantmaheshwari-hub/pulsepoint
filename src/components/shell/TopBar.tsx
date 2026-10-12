'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { localDate, MAX_RANGE_DAYS } from '@/lib/periods';
import { GenerateButton } from './GenerateButton';

export interface PeriodOpt { id: string; label: string }
export interface FreshnessView { label: string; tone: 'ok' | 'warn' | 'bad' | 'none'; detail: string }

const TONE = { ok: 'bg-fall-fill', warn: 'bg-fresh-fill', bad: 'bg-rise-fill', none: 'bg-ink-faint' };
// Pages that understand ?view=month|range. Elsewhere, picking Month or Range opens the brief page.
const PERIOD_PAGES = ['/', '/discussions'];
type View = 'week' | 'month' | 'range';

export function TopBar({ periods, freshness }: { periods: PeriodOpt[]; freshness: FreshnessView }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [rangeError, setRangeError] = useState('');
  const compare = sp.get('compare') !== 'off';
  const selected = sp.get('report') ?? periods[0]?.id ?? '';
  const onPeriodPage = PERIOD_PAGES.includes(path);
  const raw = sp.get('view');
  const view: View = onPeriodPage && (raw === 'month' || raw === 'range') ? raw : 'week';
  const today = localDate(Date.now());
  const month = sp.get('m') ?? today.slice(0, 7);
  const to = sp.get('to') ?? today;
  const from = sp.get('from') ?? localDate(Date.now() - 9 * 86_400_000);

  function go(patch: Record<string, string | null>, target = path) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    next.delete('page');
    router.push(`${target}${next.toString() ? `?${next}` : ''}`);
  }
  const setParam = (key: string, value: string | null, target = path) => go({ [key]: value }, target);

  function setView(v: View) {
    setRangeError('');
    const target = onPeriodPage ? path : '/';
    if (v === 'week') go({ view: null, m: null, from: null, to: null }, target);
    else if (v === 'month') go({ view: 'month', m: month, from: null, to: null }, target);
    else go({ view: 'range', from, to, m: null }, target);
  }

  function applyRange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const a = String(f.get('from') ?? ''), b = String(f.get('to') ?? '');
    if (!a || !b) return setRangeError('Pick both dates.');
    const days = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
    if (days < 1) return setRangeError('End must be on or after start.');
    if (days > MAX_RANGE_DAYS) return setRangeError(`At most ${MAX_RANGE_DAYS} days.`);
    setRangeError('');
    go({ view: 'range', from: a, to: b, m: null });
  }

  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-4 md:px-8">
      <form role="search" className="relative order-1 w-full sm:w-auto sm:flex-1 lg:max-w-[340px]" onSubmit={(e) => { e.preventDefault(); setParam('q', q.trim() || null, '/discussions'); }}>
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search discussions, pain points and topics</label>
        <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search discussions, pain points, topics" className="field w-full pl-9" />
      </form>

      <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
        <div role="group" aria-label="Period type" className="inline-flex h-9 items-center rounded-full border border-line bg-panel p-0.5">
          {(['week', 'month', 'range'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`h-full rounded-full px-3 text-[13px] font-medium capitalize transition-colors ${view === v ? 'bg-coal text-coal-text' : 'text-ink-muted hover:text-ink'}`}>
              {v}
            </button>
          ))}
        </div>

        {view === 'week' && (
          <>
            <label htmlFor="period" className="sr-only">Reporting week</label>
            <select id="period" className="field min-w-0 flex-1 cursor-pointer pr-8 sm:flex-none" value={selected} disabled={!periods.length}
              onChange={(e) => setParam('report', e.target.value === periods[0]?.id ? null : e.target.value)}>
              {periods.length ? periods.map((p, i) => <option key={p.id} value={p.id}>{i === 0 ? `This week: ${p.label}` : p.label}</option>) : <option>No reports yet</option>}
            </select>
          </>
        )}

        {view === 'month' && (
          <>
            <label htmlFor="period-month" className="sr-only">Month</label>
            <input id="period-month" type="month" className="field min-w-0 flex-1 sm:flex-none" value={month} max={today.slice(0, 7)} placeholder="YYYY-MM"
              onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setParam('m', e.target.value); }} />
          </>
        )}

        {view === 'range' && (
          <form key={`${from}_${to}`} onSubmit={applyRange} className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Date range">
            <label htmlFor="period-from" className="sr-only">Start date</label>
            <input id="period-from" name="from" type="date" className="field min-w-0" defaultValue={from} max={today} />
            <span className="text-ink-faint" aria-hidden="true">–</span>
            <label htmlFor="period-to" className="sr-only">End date</label>
            <input id="period-to" name="to" type="date" className="field min-w-0" defaultValue={to} max={today} />
            <button className="pill">Apply</button>
            {rangeError && <span role="alert" className="text-[13px] text-rise">{rangeError}</span>}
          </form>
        )}

        <button type="button" role="switch" aria-checked={compare} onClick={() => setParam('compare', compare ? 'off' : null)} className="pill whitespace-nowrap">
          <span className={`relative h-4 w-7 rounded-full transition-colors ${compare ? 'bg-violet' : 'bg-line-strong'}`} aria-hidden="true">
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${compare ? 'left-3.5' : 'left-0.5'}`} />
          </span>
          vs previous {view === 'week' ? 'week' : 'period'}
        </button>
      </div>

      <div className="order-3 ml-auto flex items-center gap-2.5">
        <Link href="/health" className="pill-quiet hidden md:inline-flex" title={freshness.detail}>
          <span className={`h-2 w-2 rounded-full ${TONE[freshness.tone]}`} aria-hidden="true" />
          {freshness.label}
        </Link>
        <GenerateButton />
      </div>
    </header>
  );
}
