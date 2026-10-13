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

  const bare = 'h-8 min-w-0 rounded-full bg-transparent px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunk focus:outline-none focus-visible:ring-2 focus-visible:ring-violet';

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2.5 rounded-t-sheet border-b border-line-soft bg-paper/85 px-5 py-3.5 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75 md:px-8 lg:px-10">
      <form role="search" className="relative order-1 w-full sm:w-52 xl:w-60 2xl:w-72" onSubmit={(e) => { e.preventDefault(); setParam('q', q.trim() || null, '/discussions'); }}>
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search discussions, pain points and topics</label>
        <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search discussions…" className="field h-10 w-full bg-panel/80 pl-9" />
      </form>

      {/* Period dock: what time span every number on the page refers to */}
      <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
        <div className="dock w-full min-w-0 sm:w-auto">
          <div role="group" aria-label="Period type" className="flex shrink-0 items-center">
            {(['week', 'month', 'range'] as View[]).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`seg ${view === v ? 'seg-on' : ''}`}>{v}</button>
            ))}
          </div>
          {view !== 'range' && <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />}
          {view === 'week' && (
            <>
              <label htmlFor="period" className="sr-only">Reporting week</label>
              <select id="period" className={`${bare} flex-1 cursor-pointer pr-7 sm:flex-none`} value={selected} disabled={!periods.length}
                onChange={(e) => setParam('report', e.target.value === periods[0]?.id ? null : e.target.value)}>
                {periods.length ? periods.map((p, i) => <option key={p.id} value={p.id}>{i === 0 ? `This week · ${p.label}` : p.label}</option>) : <option>No reports yet</option>}
              </select>
            </>
          )}
          {view === 'month' && (
            <>
              <label htmlFor="period-month" className="sr-only">Month</label>
              <input id="period-month" type="month" className={`${bare} flex-1 sm:flex-none`} value={month} max={today.slice(0, 7)} placeholder="YYYY-MM"
                onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setParam('m', e.target.value); }} />
            </>
          )}
        </div>

        {view === 'range' && (
          <form key={`${from}_${to}`} onSubmit={applyRange} className="dock min-w-0 max-w-full flex-wrap" aria-label="Date range">
            <label htmlFor="period-from" className="sr-only">Start date</label>
            <input id="period-from" name="from" type="date" className={bare} defaultValue={from} max={today} />
            <span className="text-ink-faint" aria-hidden="true">–</span>
            <label htmlFor="period-to" className="sr-only">End date</label>
            <input id="period-to" name="to" type="date" className={bare} defaultValue={to} max={today} />
            <button className="h-8 rounded-full bg-coal px-3.5 text-[13px] font-medium text-coal-text hover:bg-coal-2">Apply</button>
          </form>
        )}
        {rangeError && <span role="alert" className="text-[13px] text-rise">{rangeError}</span>}

        <button type="button" role="switch" aria-checked={compare} onClick={() => setParam('compare', compare ? 'off' : null)} className="pill h-10 whitespace-nowrap">
          <span className={`relative h-4 w-7 rounded-full transition-colors ${compare ? 'bg-violet' : 'bg-line-strong'}`} aria-hidden="true">
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${compare ? 'left-3.5' : 'left-0.5'}`} />
          </span>
          vs previous {view === 'week' ? 'week' : 'period'}
        </button>
      </div>

      <div className="order-3 ml-auto flex items-center gap-2">
        <Link href="/health" className="hidden h-10 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink-muted transition-colors hover:bg-panel hover:text-ink lg:inline-flex" title={`${freshness.label} · ${freshness.detail}`} aria-label={`${freshness.label}. ${freshness.detail}`}>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            {freshness.tone === 'ok' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall-fill opacity-40" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${TONE[freshness.tone]}`} />
          </span>
          <span className="hidden 2xl:inline">{freshness.label}</span>
        </Link>
        <GenerateButton />
      </div>
    </header>
  );
}
