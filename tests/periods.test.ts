import { describe, expect, it } from 'vitest';
import { localDate, MAX_RANGE_DAYS, monthWindow, parsePeriod, periodParams, rangeWindow } from '@/lib/periods';

const iso = (d: Date) => d.toISOString();

describe('monthWindow (IST)', () => {
  it('starts and ends at IST midnight, not UTC midnight', () => {
    const r = monthWindow('2026-09')!;
    expect(iso(r.w.currentStart)).toBe('2026-08-31T18:30:00.000Z'); // 1 Sep 00:00 IST
    expect(iso(r.w.currentEnd)).toBe('2026-09-30T18:30:00.000Z'); // 1 Oct 00:00 IST
    expect(r.days).toBe(30);
  });
  it('compares with the previous period of equal length, immediately before', () => {
    const { w } = monthWindow('2026-09')!;
    expect(iso(w.previousEnd)).toBe(iso(w.currentStart));
    expect(w.currentEnd.getTime() - w.currentStart.getTime()).toBe(w.previousEnd.getTime() - w.previousStart.getTime());
    expect(iso(w.previousStart)).toBe('2026-08-01T18:30:00.000Z'); // 30 days before 1 Sep IST = 2 Aug IST
  });
  it('handles December → January and February in a leap year', () => {
    expect(iso(monthWindow('2026-12')!.w.currentEnd)).toBe('2026-12-31T18:30:00.000Z');
    expect(monthWindow('2028-02')!.days).toBe(29);
    expect(monthWindow('2026-02')!.days).toBe(28);
  });
  it('rejects nonsense', () => {
    expect(monthWindow('2026-13')).toBeNull();
    expect(monthWindow('Sept')).toBeNull();
  });
});

describe('rangeWindow (IST, inclusive)', () => {
  it('a 10-day range covers both end days in full', () => {
    const r = rangeWindow('2026-10-01', '2026-10-10');
    if ('error' in r) throw new Error(r.error);
    expect(r.days).toBe(10);
    expect(iso(r.w.currentStart)).toBe('2026-09-30T18:30:00.000Z');
    expect(iso(r.w.currentEnd)).toBe('2026-10-10T18:30:00.000Z'); // end of 10 Oct IST
    expect(iso(r.w.previousStart)).toBe('2026-09-20T18:30:00.000Z'); // the 10 days before
    expect(iso(r.w.previousEnd)).toBe(iso(r.w.currentStart));
  });
  it('allows a single day and up to the maximum length', () => {
    const one = rangeWindow('2026-10-05', '2026-10-05');
    expect('error' in one ? one.error : one.days).toBe(1);
    const max = rangeWindow('2026-07-01', '2026-09-30');
    expect('error' in max ? max.error : max.days).toBe(MAX_RANGE_DAYS);
  });
  it('refuses ranges that are too long, backwards or invalid', () => {
    expect(rangeWindow('2026-07-01', '2026-10-01')).toEqual({ error: 'A range can be at most 92 days (this one is 93).' });
    expect('error' in rangeWindow('2026-10-10', '2026-10-01')).toBe(true);
    expect('error' in rangeWindow('2026-02-30', '2026-03-02')).toBe(true);
    expect('error' in rangeWindow('', '2026-03-02')).toBe(true);
  });
});

describe('parsePeriod (URL)', () => {
  const now = new Date('2026-10-13T20:00:00Z'); // 14 Oct 01:30 IST
  it('defaults to the weekly view', () => {
    expect(parsePeriod({}, now)).toEqual({ view: 'week' });
    expect(parsePeriod({ view: 'banana' }, now)).toEqual({ view: 'week' });
  });
  it('reads month and range from the URL and round-trips them', () => {
    const m = parsePeriod({ view: 'month', m: '2026-09' }, now);
    expect('label' in m && m.label).toBe('September 2026');
    expect(periodParams(m)).toEqual({ view: 'month', m: '2026-09' });
    const r = parsePeriod({ view: 'range', from: '2026-10-01', to: '2026-10-10' }, now);
    expect('label' in r && r.label).toBe('1 Oct – 10 Oct 2026');
    expect(periodParams(r)).toEqual({ view: 'range', from: '2026-10-01', to: '2026-10-10' });
  });
  it('uses the IST calendar date for defaults', () => {
    expect(localDate(now.getTime())).toBe('2026-10-14');
    const m = parsePeriod({ view: 'month' }, now);
    expect('month' in m && m.month).toBe('2026-10');
  });
  it('reports a too-long range instead of guessing', () => {
    expect(parsePeriod({ view: 'range', from: '2026-01-01', to: '2026-10-01' }, now)).toHaveProperty('error');
  });
});
