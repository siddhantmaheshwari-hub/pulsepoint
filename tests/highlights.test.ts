import { describe, expect, it } from 'vitest';
import { weekHighlights } from '@/lib/highlights';
import type { TopicMetricRow } from '@/lib/types';

const m = (o: Partial<TopicMetricRow>): TopicMetricRow => ({
  pain_point_key: 'k', label: 'L', topic_slug: null, current_count: 0, previous_count: 0, abs_change: 0, pct_change: null, trend: 'none', distinct_sources: 1, by_source: {},
  first_observed: null, last_observed: null, unresolved_count: 0, bug_reports: 0, avg_confidence: 0.9, verified_share: 1, sufficiency: 'limited', underserved: false, evidence: [], ...o,
});

describe('weekHighlights', () => {
  const metrics = [
    m({ pain_point_key: 'ai-pr', label: 'Reviewing AI PRs', current_count: 5, previous_count: 4, abs_change: 1, pct_change: 25, trend: 'stable', unresolved_count: 4 }),
    m({ pain_point_key: 'flaky', label: 'Flaky tests', current_count: 4, previous_count: 1, abs_change: 3, pct_change: 300, trend: 'rising', unresolved_count: 1 }),
    m({ pain_point_key: 'noise', label: 'Bot noise', current_count: 2, previous_count: 0, abs_change: 2, trend: 'new', unresolved_count: 2 }),
    m({ pain_point_key: 'solo', label: 'One-off', current_count: 1, previous_count: 0, abs_change: 1, trend: 'new', unresolved_count: 1 }),
    m({ pain_point_key: 'gone', label: 'Gone', current_count: 0, previous_count: 3, abs_change: -3, trend: 'gone' }),
  ];
  const h = weekHighlights(metrics);

  it('biggest = most unique discussions this week', () => {
    expect(h.biggest).toEqual({ key: 'ai-pr', label: 'Reviewing AI PRs', detail: '5 discussions · 4 unresolved' });
  });
  it('growing fastest = largest absolute rise, shown as before → after', () => {
    expect(h.growing).toEqual({ key: 'flaky', label: 'Flaky tests', detail: '1 → 4 discussions' });
  });
  it('least solved needs 2+ discussions, so a single unanswered post never wins', () => {
    expect(h.leastSolved?.key).toBe('noise');
    expect(h.leastSolved?.detail).toBe('100% unresolved (2 of 2)');
  });
  it('new this week = biggest new pain point not already shown above', () => {
    // "Bot noise" is already the least-solved answer, so the next new pain point is shown instead
    expect(h.fresh).toEqual({ key: 'solo', label: 'One-off', detail: '1 discussion, none last week' });
  });
  it('shows four different pain points when the data allows', () => {
    expect(new Set([h.biggest?.key, h.growing?.key, h.leastSolved?.key, h.fresh?.key]).size).toBe(4);
  });
  it('repeats a pain point only when nothing else qualifies', () => {
    const one = weekHighlights([m({ pain_point_key: 'flaky', label: 'Flaky tests', current_count: 6, previous_count: 0, abs_change: 6, trend: 'new', unresolved_count: 6 })]);
    expect([one.biggest?.key, one.growing?.key, one.leastSolved?.key, one.fresh?.key]).toEqual(['flaky', 'flaky', 'flaky', 'flaky']);
  });
  it('returns nulls instead of inventing answers', () => {
    const empty = weekHighlights([m({ trend: 'gone', previous_count: 2, abs_change: -2 })]);
    expect(empty).toEqual({ biggest: null, growing: null, leastSolved: null, fresh: null });
    const flat = weekHighlights([m({ current_count: 3, previous_count: 3, trend: 'stable', unresolved_count: 0 })]);
    expect(flat.growing).toBeNull();
    expect(flat.leastSolved).toBeNull();
    expect(flat.fresh).toBeNull();
  });
});
