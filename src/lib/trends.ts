// Deterministic trend math. Shared by server (report generation) and client (source filters).
// The language model never computes or states these numbers.

export type Trend = 'rising' | 'declining' | 'stable' | 'new' | 'gone' | 'none';
export type Sufficiency = 'sufficient' | 'limited' | 'insufficient';

export const TREND_RULES = {
  minAbsChange: 2, // at least 2 more/fewer unique discussions…
  minPctChange: 25, // …and at least a 25% move to call it rising/declining
} as const;

export interface TrendResult {
  current: number;
  previous: number;
  absChange: number;
  pctChange: number | null; // null when previous = 0 (undefined percentage)
  trend: Trend;
}

function assertCount(n: number, name: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got ${n}`);
}

export function computeTrend(current: number, previous: number): TrendResult {
  assertCount(current, 'current');
  assertCount(previous, 'previous');
  const absChange = current - previous;
  const pctChange = previous > 0 ? Math.round((absChange / previous) * 1000) / 10 : null;
  let trend: Trend;
  if (current === 0 && previous === 0) trend = 'none';
  else if (previous === 0) trend = 'new';
  else if (current === 0) trend = 'gone';
  else if (absChange >= TREND_RULES.minAbsChange && (pctChange ?? 0) >= TREND_RULES.minPctChange) trend = 'rising';
  else if (absChange <= -TREND_RULES.minAbsChange && (pctChange ?? 0) <= -TREND_RULES.minPctChange) trend = 'declining';
  else trend = 'stable';
  return { current, previous, absChange, pctChange, trend };
}

export function sufficiency(current: number, previous: number, distinctSources: number): Sufficiency {
  const total = current + previous;
  if (total < 3) return 'insufficient';
  if (total < 8 || distinctSources < 2) return 'limited';
  return 'sufficient';
}

export function formatPct(r: Pick<TrendResult, 'pctChange' | 'trend'>): string {
  if (r.trend === 'new') return 'New';
  if (r.trend === 'none' || r.pctChange === null) return '—';
  const sign = r.pctChange > 0 ? '+' : '';
  return `${sign}${r.pctChange}%`;
}
