import { describe, expect, it } from 'vitest';
import { buildMetrics, type AnalyzedRow } from '@/lib/metrics';
import { reportWindows } from '@/lib/windows';

const w = reportWindows(new Date('2026-10-09T02:30:00Z'), 330);
const CUR = '2026-10-05T10:00:00Z';
const PREV = '2026-09-28T10:00:00Z';
const OLD = '2026-09-01T10:00:00Z';
let n = 0;
function row(p: Partial<AnalyzedRow>): AnalyzedRow {
  n++;
  return {
    discussion_id: `d${n}`, source_id: 'hackernews', title: `t${n}`, url: `https://x/${n}`, created_at_source: CUR, score: 1,
    is_relevant: true, kind: 'workflow_pain', pain_point_key: 'review-bot-false-positives', topic_slug: 'automated-review',
    resolution_status: 'unresolved', evidence_quote: 'quote text here ok', evidence_verified: true, confidence: 0.8, existing_workaround: null, ...p,
  };
}

describe('buildMetrics', () => {
  it('counts unique discussions per week and computes trend deterministically', () => {
    const rows = [row({}), row({ source_id: 'stackoverflow' }), row({}), row({ created_at_source: PREV })];
    const [m] = buildMetrics(rows, w, new Map());
    expect(m).toMatchObject({ current_count: 3, previous_count: 1, abs_change: 2, pct_change: 200, trend: 'rising', distinct_sources: 2 });
    expect(m.by_source).toEqual({ hackernews: { current: 2, previous: 1 }, stackoverflow: { current: 1, previous: 0 } });
  });
  it('deduplicates repeated rows for the same discussion', () => {
    const r = row({});
    const [m] = buildMetrics([r, { ...r }, { ...r }], w, new Map());
    expect(m.current_count).toBe(1);
  });
  it('excludes irrelevant, non-pain and out-of-window discussions', () => {
    const rows = [row({}), row({ is_relevant: false }), row({ kind: 'how_to_question' }), row({ created_at_source: OLD }), row({ pain_point_key: null })];
    const [m] = buildMetrics(rows, w, new Map());
    expect(m.current_count).toBe(1);
  });
  it('separates isolated bugs from recurring pain', () => {
    const rows = [row({ kind: 'isolated_bug' }), row({ kind: 'isolated_bug' }), row({})];
    const [m] = buildMetrics(rows, w, new Map());
    expect(m.current_count).toBe(1);
    expect(m.bug_reports).toBe(2);
  });
  it('labels zero-baseline pain points as new with null percentage', () => {
    const [m] = buildMetrics([row({ pain_point_key: 'merge-queue-starvation' })], w, new Map());
    expect(m).toMatchObject({ trend: 'new', pct_change: null, sufficiency: 'insufficient' });
  });
  it('flags underserved only when recurring and mostly unresolved', () => {
    const a = buildMetrics([row({ pain_point_key: 'aaa' }), row({ pain_point_key: 'aaa', resolution_status: 'resolved' })], w, new Map());
    expect(a[0].underserved).toBe(true); // 1 of 2 unresolved = 50%
    const b = buildMetrics([row({ pain_point_key: 'bbb', resolution_status: 'resolved' }), row({ pain_point_key: 'bbb', resolution_status: 'resolved' })], w, new Map());
    expect(b[0].underserved).toBe(false);
    const c = buildMetrics([row({ pain_point_key: 'ccc' })], w, new Map());
    expect(c[0].underserved).toBe(false); // single discussion is not recurring
  });
  it('hides quotes that failed verbatim verification from evidence', () => {
    const [m] = buildMetrics([row({ evidence_verified: false, evidence_quote: 'made up' })], w, new Map());
    expect(m.evidence[0].quote).toBeNull();
    expect(m.verified_share).toBe(0);
  });
  it('keeps pain points that disappeared this week as gone', () => {
    const [m] = buildMetrics([row({ created_at_source: PREV }), row({ created_at_source: PREV })], w, new Map());
    expect(m).toMatchObject({ current_count: 0, previous_count: 2, trend: 'gone', pct_change: -100 });
  });
  it('handles empty input (missing history)', () => {
    expect(buildMetrics([], w, new Map())).toEqual([]);
  });
});
