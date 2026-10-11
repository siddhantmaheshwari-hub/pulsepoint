import { formatPct, type Trend } from '@/lib/trends';

export const TREND_STYLE: Record<Trend, { color: string; label: string; glyph: string }> = {
  rising: { color: '#C2410C', label: 'Rising', glyph: '▲' },
  declining: { color: '#2F7A5B', label: 'Declining', glyph: '▼' },
  stable: { color: '#5E6675', label: 'Stable', glyph: '■' },
  new: { color: '#5B47B0', label: 'Newly observed', glyph: '●' },
  gone: { color: '#5E6675', label: 'Not seen this week', glyph: '○' },
  none: { color: '#5E6675', label: 'No data', glyph: '·' },
};

export function TrendMark({ trend, pct }: { trend: Trend; pct: number | null }) {
  const s = TREND_STYLE[trend];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: s.color }} title={s.label}>
      <span aria-hidden="true" className="text-[10px]">{s.glyph}</span>
      <span>{trend === 'gone' ? '−100%' : formatPct({ trend, pctChange: pct })}</span>
      <span className="sr-only">{s.label}</span>
    </span>
  );
}
