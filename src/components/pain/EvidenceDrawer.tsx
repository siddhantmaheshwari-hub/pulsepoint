'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import type { TopicMetricRow } from '@/lib/types';
import { SourceChip, Sufficiency } from '../ui/bits';
import { TrendTag } from '../ui/Trend';

const RES: Record<string, string> = { unresolved: 'Unresolved', partially_resolved: 'Partly resolved', resolved: 'Resolved', unknown: 'Status unclear' };

export function EvidenceDrawer({ m, history, labels, topicName, periodStart, compare, onClose }: {
  m: TopicMetricRow; history: (number | null)[]; labels: string[]; topicName: string | null; periodStart: string; compare: boolean; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [onClose]);
  const recurring = m.first_observed ? Date.parse(m.first_observed) < Date.parse(periodStart) : false;
  const workarounds = [...new Set(m.evidence.map((e) => e.workaround).filter(Boolean))] as string[];
  const max = Math.max(1, ...history.map((v) => v ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/25 backdrop-blur-[1px]" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="ev-title" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[560px] flex-col overflow-y-auto bg-paper shadow-pop motion-safe:animate-[slidein_.18s_ease-out]">
        <div className="sticky top-0 z-10 border-b border-line bg-paper/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{topicName ?? 'Uncategorised'} · {recurring ? `recurring since ${fmtDate(m.first_observed)}` : 'first seen this week'}</p>
              <h2 id="ev-title" className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{m.label}</h2>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-panel hover:border-line-strong" aria-label="Close evidence"><X size={16} /></button>
          </div>
        </div>

        <div className="space-y-8 px-6 py-6">
          <dl className="grid grid-cols-3 gap-4">
            <div><dt className="meta">This week</dt><dd className="mt-1 text-[32px] font-light leading-none">{m.current_count}</dd></div>
            {compare && <div><dt className="meta">Previous week</dt><dd className="mt-1 text-[32px] font-light leading-none text-ink-muted">{m.previous_count}</dd></div>}
            <div><dt className="meta">Change</dt><dd className="mt-2"><TrendTag trend={m.trend} pct={m.pct_change} /></dd></div>
            <div><dt className="meta">Unresolved</dt><dd className="mt-1 text-[15px] font-medium">{m.unresolved_count} of {m.current_count}</dd></div>
            <div><dt className="meta">Sources</dt><dd className="mt-1 text-[15px] font-medium">{m.distinct_sources}</dd></div>
            <div><dt className="meta">Evidence</dt><dd className="mt-1"><Sufficiency value={m.sufficiency} /><span className="block text-xs text-ink-muted">{m.verified_share === null ? 'no quotes' : `${Math.round(m.verified_share * 100)}% quotes verified`}</span></dd></div>
          </dl>

          <section aria-labelledby="ev-hist">
            <h3 id="ev-hist" className="h-panel">Weekly history</h3>
            {history.filter((v) => v !== null).length < 2 ? <p className="mt-2 text-sm text-ink-muted">History builds up as weekly reports are stored.</p> : (
              <div className="mt-3 flex h-24 items-end gap-2" role="img" aria-label={`Weekly counts: ${history.map((v, i) => `${labels[i]} ${v ?? 'no report'}`).join(', ')}`}>
                {history.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                    {v === null ? <div className="hatch h-5 w-2.5 rounded-full bg-sunk" title="No report that week" /> :
                      <div className={`w-2.5 rounded-full ${i === history.length - 1 ? 'bg-coal' : 'bg-teal'}`} style={{ height: Math.max(4, (v / max) * 72) }} title={`${labels[i]}: ${v}`} />}
                    <span className="text-[10px] text-ink-faint">{labels[i]}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {workarounds.length > 0 && (
            <section aria-labelledby="ev-wa">
              <h3 id="ev-wa" className="h-panel">Workarounds developers mention</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{workarounds.map((w) => <li key={w} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />{w}</li>)}</ul>
            </section>
          )}

          <section aria-labelledby="ev-src">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="ev-src" className="h-panel">Source discussions</h3>
              <Link href={`/discussions?key=${m.pain_point_key}`} className="link text-[13px]">All discussions</Link>
            </div>
            <p className="meta mt-1">Original posts. Quotes appear only when they match the source word for word.</p>
            <ul className="mt-4 space-y-3">
              {m.evidence.map((e) => (
                <li key={e.discussion_id} className="rounded-ctl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2"><SourceChip id={e.source_id} /><span className="meta">{fmtDate(e.created_at)}</span><span className="meta">·</span><span className={`text-xs ${e.resolution_status === 'unresolved' ? 'text-rise' : 'text-ink-muted'}`}>{RES[e.resolution_status]}</span></div>
                  <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 flex items-start gap-1.5 text-[15px] font-medium leading-snug hover:text-violet-ink">
                    {e.title}<ExternalLink size={13} className="mt-1 shrink-0 text-ink-faint" aria-hidden="true" /><span className="sr-only">(opens in new tab)</span>
                  </a>
                  {e.quote && <blockquote className="mt-2.5 border-l-2 border-line-strong pl-3 text-[14px] leading-relaxed text-ink-2">“{e.quote}”</blockquote>}
                </li>
              ))}
              {!m.evidence.length && <li className="text-sm text-ink-muted">No discussions this week — this pain point appeared only in the previous week.</li>}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
