import { ArrowDownRight, ArrowUpRight, Minus, Sparkle } from 'lucide-react';
import { formatPct, type Trend } from '@/lib/trends';

export const TREND_META: Record<Trend, { label: string; text: string; bg: string; fill: string }> = {
  rising: { label: 'Rising', text: 'text-rise', bg: 'bg-rise-soft', fill: '#C4472A' },
  declining: { label: 'Easing', text: 'text-fall', bg: 'bg-fall-soft', fill: '#2E7D63' },
  new: { label: 'New', text: 'text-fresh', bg: 'bg-fresh-soft', fill: '#E3B33E' },
  stable: { label: 'Stable', text: 'text-ink-muted', bg: 'bg-sunk', fill: '#8E939B' },
  gone: { label: 'Not seen', text: 'text-ink-faint', bg: 'bg-sunk', fill: '#C9C5BB' },
  none: { label: 'No data', text: 'text-ink-faint', bg: 'bg-sunk', fill: '#C9C5BB' },
};

/** Trend tag: icon + deterministic % (or "New"). Colour is never the only signal. */
export function TrendTag({ trend, pct, size = 'md' }: { trend: Trend; pct: number | null; size?: 'sm' | 'md' }) {
  const m = TREND_META[trend];
  const Icon = trend === 'rising' ? ArrowUpRight : trend === 'declining' || trend === 'gone' ? ArrowDownRight : trend === 'new' ? Sparkle : Minus;
  const text = trend === 'gone' ? '−100%' : trend === 'new' ? 'New' : formatPct({ trend, pctChange: pct });
  return (
    <span className={`tag ${m.bg} ${m.text} ${size === 'sm' ? 'h-5 px-2 text-[11px]' : ''}`} title={m.label}>
      <Icon size={size === 'sm' ? 11 : 13} strokeWidth={2.2} aria-hidden="true" />
      {text}
      <span className="sr-only"> ({m.label})</span>
    </span>
  );
}
