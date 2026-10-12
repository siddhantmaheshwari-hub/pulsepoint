import { describe, expect, it } from 'vitest';
import { briefMarkdown, trendLabel } from '@/lib/export';
import type { TopicMetricRow } from '@/lib/types';

const ev = (id: string, title: string) => ({ discussion_id: id, source_id: 'hackernews' as const, title, url: `https://news.ycombinator.com/item?id=${id}`, created_at: '2026-10-09T00:00:00Z', quote: null, quote_verified: false, resolution_status: 'unresolved' as const, confidence: 0.9, workaround: null });
const metric = (o: Partial<TopicMetricRow>): TopicMetricRow => ({
  pain_point_key: 'k', label: 'L', topic_slug: null, current_count: 0, previous_count: 0, abs_change: 0, pct_change: null, trend: 'none', distinct_sources: 1, by_source: {},
  first_observed: null, last_observed: null, unresolved_count: 0, bug_reports: 0, avg_confidence: 0.9, verified_share: 1, sufficiency: 'limited', underserved: false, evidence: [], ...o,
});

describe('briefMarkdown', () => {
  const metrics = [
    metric({ pain_point_key: 'ai-pr-burden', label: 'Burden of reviewing AI PRs', current_count: 6, previous_count: 4, abs_change: 2, pct_change: 50, trend: 'rising', unresolved_count: 6, underserved: true, evidence: [ev('1', 'Ask HN: PR apocalypse?'), ev('2', 'Show HN: [prx] reviews')] }),
    metric({ pain_point_key: 'ci-outage', label: 'CI outage blocks deploys', current_count: 1, previous_count: 0, abs_change: 1, trend: 'new', unresolved_count: 1, sufficiency: 'insufficient' }),
    metric({ pain_point_key: 'gone-one', label: 'Not seen this week', current_count: 0, previous_count: 2, trend: 'gone' }),
  ];
  const md = briefMarkdown({
    periodLabel: '5 – 11 Oct 2026', url: 'https://pulse.example/?report=r1',
    totals: { pain_discussions: 7, pain_discussions_previous: 4, pain_points_tracked: 2, rising: 1, new: 1, declining: 0, discussions_analyzed: 78 },
    metrics,
    synthesis: { headline: 'AI PR volume strains review', findings: [], underserved: [{ pain_point_key: 'ai-pr-burden', why: 'No tool triages AI PRs.', evidence_ids: ['1'] }], investigate: [{ recommendation: 'Interview leads', rationale: 'Backlogs are growing.', pain_point_keys: ['ai-pr-burden'], evidence_ids: ['2', 'unknown'] }], caveats: ['Single source.'], dropped_unsupported: 0 },
  });

  it('uses the snapshot numbers and shows a zero baseline as New, never a percentage', () => {
    expect(md).toContain('| Burden of reviewing AI PRs | 6 | 4 | Rising +50% | 6/6 | limited |');
    expect(md).toContain('| CI outage blocks deploys | 1 | 0 | New | 1/1 | insufficient |');
    expect(md).not.toContain('Not seen this week |'); // only active pain points in the table
    expect(md).toContain('7 discussions described a workflow pain or unmet need (4 the week before)');
  });
  it('labels every AI passage and keeps evidence links', () => {
    expect(md).toContain('**AI PR volume strains review** _(AI reading)_');
    expect(md).toContain('_AI reading:_ No tool triages AI PRs.');
    expect(md).toContain('_(AI suggestions, not decisions)_');
    expect(md).toContain('[Show HN: prx reviews](https://news.ycombinator.com/item?id=2)'); // brackets stripped, unknown id ignored
    expect(md).toContain('## Caveats _(AI)_');
    expect(md.trim().endsWith('Full brief: https://pulse.example/?report=r1')).toBe(true);
  });
  it('works without an AI synthesis', () => {
    const plain = briefMarkdown({ periodLabel: 'x', url: null, totals: { pain_discussions: 0, pain_discussions_previous: 0, pain_points_tracked: 0, rising: 0, new: 0, declining: 0, discussions_analyzed: 0 }, metrics: [], synthesis: null });
    expect(plain).not.toMatch(/AI/);
  });
  it('trendLabel never prints a percentage for new or gone', () => {
    expect(trendLabel('new', null)).toBe('New');
    expect(trendLabel('gone', -100)).toBe('Not seen');
    expect(trendLabel('declining', -66.7)).toBe('Easing -66.7%');
  });
});
