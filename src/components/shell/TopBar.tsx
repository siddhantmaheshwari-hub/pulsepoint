'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { GenerateButton } from './GenerateButton';

export interface PeriodOpt { id: string; label: string }
export interface FreshnessView { label: string; tone: 'ok' | 'warn' | 'bad' | 'none'; detail: string }

const TONE = { ok: 'bg-fall-fill', warn: 'bg-fresh-fill', bad: 'bg-rise-fill', none: 'bg-ink-faint' };

export function TopBar({ periods, freshness }: { periods: PeriodOpt[]; freshness: FreshnessView }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const compare = sp.get('compare') !== 'off';
  const selected = sp.get('report') ?? periods[0]?.id ?? '';

  function setParam(key: string, value: string | null, target = path) {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key); else next.set(key, value);
    next.delete('page');
    router.push(`${target}${next.toString() ? `?${next}` : ''}`);
  }

  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-4 md:px-8">
      <form role="search" className="relative order-1 w-full sm:w-auto sm:flex-1 lg:max-w-[340px]" onSubmit={(e) => { e.preventDefault(); setParam('q', q.trim() || null, '/discussions'); }}>
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Search discussions, pain points and topics</label>
        <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search discussions, pain points, topics" className="field w-full pl-9" />
      </form>

      <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
        <label htmlFor="period" className="sr-only">Reporting week</label>
        <select id="period" className="field min-w-0 flex-1 cursor-pointer pr-8 sm:flex-none" value={selected} disabled={!periods.length}
          onChange={(e) => setParam('report', e.target.value === periods[0]?.id ? null : e.target.value)}>
          {periods.length ? periods.map((p, i) => <option key={p.id} value={p.id}>{i === 0 ? `This week: ${p.label}` : p.label}</option>) : <option>No reports yet</option>}
        </select>
        <button type="button" role="switch" aria-checked={compare} onClick={() => setParam('compare', compare ? 'off' : null)} className="pill whitespace-nowrap">
          <span className={`relative h-4 w-7 rounded-full transition-colors ${compare ? 'bg-violet' : 'bg-line-strong'}`} aria-hidden="true">
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${compare ? 'left-3.5' : 'left-0.5'}`} />
          </span>
          vs previous week
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
