import { describe, expect, it } from 'vitest';
import { computeTrend, formatPct, sufficiency } from '@/lib/trends';

describe('computeTrend', () => {
  it('computes absolute and percentage change', () => {
    expect(computeTrend(14, 4)).toEqual({ current: 14, previous: 4, absChange: 10, pctChange: 250, trend: 'rising' });
    expect(computeTrend(3, 6)).toMatchObject({ absChange: -3, pctChange: -50, trend: 'declining' });
  });
  it('labels a zero baseline as newly observed with no percentage', () => {
    const r = computeTrend(5, 0);
    expect(r.trend).toBe('new');
    expect(r.pctChange).toBeNull();
    expect(formatPct(r)).toBe('New');
  });
  it('marks disappearance and empty cases', () => {
    expect(computeTrend(0, 4)).toMatchObject({ trend: 'gone', pctChange: -100 });
    expect(computeTrend(0, 0)).toMatchObject({ trend: 'none', pctChange: null });
  });
  it('requires both absolute and relative movement to call a trend', () => {
    expect(computeTrend(2, 1).trend).toBe('stable'); // +100% but only +1 discussion
    expect(computeTrend(22, 20).trend).toBe('stable'); // +2 but only +10%
    expect(computeTrend(25, 20).trend).toBe('rising');
  });
  it('rounds percentages to one decimal', () => {
    expect(computeTrend(4, 3).pctChange).toBe(33.3);
  });
  it('rejects invalid counts', () => {
    expect(() => computeTrend(-1, 2)).toThrow();
    expect(() => computeTrend(1.5, 2)).toThrow();
  });
});

describe('sufficiency', () => {
  it('grades evidence volume and source diversity', () => {
    expect(sufficiency(1, 1, 1)).toBe('insufficient');
    expect(sufficiency(4, 2, 2)).toBe('limited');
    expect(sufficiency(10, 2, 1)).toBe('limited');
    expect(sufficiency(10, 4, 2)).toBe('sufficient');
  });
});
