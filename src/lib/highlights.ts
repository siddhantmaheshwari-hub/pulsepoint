import type { TopicMetricRow } from './types';

// "This week in brief": four deterministic answers picked from the computed metrics (never by the AI).
// Each slot prefers a pain point not already shown in an earlier slot, so the strip says four different things
// when the data allows; it repeats one only when no other pain point qualifies.

export interface Highlight { key: string; label: string; detail: string }
export interface Highlights { biggest: Highlight | null; growing: Highlight | null; leastSolved: Highlight | null; fresh: Highlight | null }

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function weekHighlights(metrics: TopicMetricRow[]): Highlights {
  const active = metrics.filter((m) => m.current_count > 0);
  const used = new Set<string>();
  /** First candidate not shown yet; otherwise the best candidate even if repeated. */
  const pick = (ranked: TopicMetricRow[]) => {
    const m = ranked.find((x) => !used.has(x.pain_point_key)) ?? ranked[0];
    if (m) used.add(m.pain_point_key);
    return m;
  };

  const biggest = pick([...active].sort((a, b) => b.current_count - a.current_count || b.abs_change - a.abs_change || a.label.localeCompare(b.label)));

  // Growth = absolute change in unique discussions (rising or newly observed).
  const growing = pick(active.filter((m) => m.abs_change > 0 && (m.trend === 'rising' || m.trend === 'new'))
    .sort((a, b) => b.abs_change - a.abs_change || b.current_count - a.current_count || a.label.localeCompare(b.label)));

  // Least solved needs at least 2 discussions, so a single unanswered post never headlines.
  const share = (m: TopicMetricRow) => m.unresolved_count / m.current_count;
  const leastSolved = pick(active.filter((m) => m.current_count >= 2 && m.unresolved_count > 0)
    .sort((a, b) => share(b) - share(a) || b.current_count - a.current_count || a.label.localeCompare(b.label)));

  const fresh = pick(active.filter((m) => m.trend === 'new')
    .sort((a, b) => b.current_count - a.current_count || a.label.localeCompare(b.label)));

  return {
    biggest: biggest ? { key: biggest.pain_point_key, label: biggest.label, detail: `${n(biggest.current_count, 'discussion')} · ${biggest.unresolved_count} unresolved` } : null,
    growing: growing ? { key: growing.pain_point_key, label: growing.label, detail: `${growing.previous_count} → ${growing.current_count} discussions` } : null,
    leastSolved: leastSolved ? { key: leastSolved.pain_point_key, label: leastSolved.label, detail: `${Math.round(share(leastSolved) * 100)}% unresolved (${leastSolved.unresolved_count} of ${leastSolved.current_count})` } : null,
    fresh: fresh ? { key: fresh.pain_point_key, label: fresh.label, detail: `${n(fresh.current_count, 'discussion')}, none last week` } : null,
  };
}
