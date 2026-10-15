'use client';
import { useCallback, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TopicMetricRow } from '@/lib/types';
import { TREND_META, TrendTag } from '../ui/Trend';
import { EvidenceDrawer } from './EvidenceDrawer';

/**
 * "Most talked-about problems": thick bars sized by unique discussions this week, coloured by trend meaning
 * (vermilion rising, amber new, grey stable/easing). A tick marks last week's count. Each row opens the evidence drawer.
 */
export function PainBars({ metrics, sparks, sparkLabels, topics, periodStart, compare, limit = 7 }: {
  metrics: TopicMetricRow[]; sparks: Record<string, (number | null)[]>; sparkLabels: string[]; topics: Record<string, string>; periodStart: string; compare: boolean; limit?: number;
}) {
  const [open, setOpen] = useState<TopicMetricRow | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const rows = metrics.filter((m) => m.current_count > 0).sort((a, b) => b.current_count - a.current_count || b.abs_change - a.abs_change || a.label.localeCompare(b.label)).slice(0, limit);
  const max = Math.max(1, ...rows.map((m) => Math.max(m.current_count, compare ? m.previous_count : 0)));
  if (!rows.length) return <p className="py-6 text-sm text-ink-muted">No pain discussions this week.</p>;
  return (
    <>
      <ol className="space-y-1">
        {rows.map((m, i) => {
          const fill = TREND_META[m.trend].fill === '#C9C5BB' ? '#8E939B' : TREND_META[m.trend].fill;
          return (
            <li key={m.pain_point_key}>
              <button type="button" onClick={() => setOpen(m)} className="group -mx-2 block w-[calc(100%+16px)] rounded-ctl px-2 py-2.5 text-left transition-colors hover:bg-sand/70">
                <span className="flex items-center gap-3">
                  <span className="w-5 shrink-0 font-mono text-[11px] text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink group-hover:text-violet-ink">{m.label}</span>
                    <span className="block truncate text-[12px] text-ink-muted">{(m.topic_slug && topics[m.topic_slug]) ?? 'Uncategorised'}{m.underserved ? ' · ' : ''}{m.underserved && <span className="font-medium text-rise">Underserved</span>}</span>
                  </span>
                  {compare && <TrendTag trend={m.trend} pct={m.pct_change} size="sm" />}
                  <ChevronRight size={15} className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-2 flex items-center gap-3 pl-8">
                  <span className="relative h-3 flex-1 rounded-full bg-sunk" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${Math.max(3, (m.current_count / max) * 100)}%`, background: fill }} />
                    {compare && m.previous_count > 0 && <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/45" style={{ left: `calc(${(m.previous_count / max) * 100}% - 1px)` }} title={`Last week: ${m.previous_count}`} />}
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums"><span className="text-[15px] font-semibold">{m.current_count}</span>{compare && <span className="text-[12px] text-ink-faint"> / {m.previous_count}</span>}</span>
                </span>
                <span className="sr-only">{`${m.current_count} discussions this week${compare ? `, ${m.previous_count} last week` : ''}. Open evidence.`}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {open && <EvidenceDrawer m={open} history={sparks[open.pain_point_key] ?? []} labels={sparkLabels} topicName={open.topic_slug ? topics[open.topic_slug] ?? null : null} periodStart={periodStart} compare={compare} onClose={close} />}
    </>
  );
}
