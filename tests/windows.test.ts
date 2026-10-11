import { describe, expect, it } from 'vitest';
import { inWindow, reportWindows } from '@/lib/windows';

describe('reportWindows', () => {
  it('ends at local (IST) midnight and spans two consecutive 7-day periods', () => {
    // Friday 2026-10-09 08:00 IST = 02:30 UTC
    const w = reportWindows(new Date('2026-10-09T02:30:00Z'), 330);
    expect(w.currentEnd.toISOString()).toBe('2026-10-08T18:30:00.000Z'); // 9 Oct 00:00 IST
    expect(w.currentStart.toISOString()).toBe('2026-10-01T18:30:00.000Z');
    expect(w.previousEnd.toISOString()).toBe(w.currentStart.toISOString());
    expect(w.previousStart.toISOString()).toBe('2026-09-24T18:30:00.000Z');
  });
  it('is stable for any time during the same local day (idempotent reruns)', () => {
    const a = reportWindows(new Date('2026-10-08T18:31:00Z'), 330);
    const b = reportWindows(new Date('2026-10-09T18:29:00Z'), 330);
    expect(a.currentEnd.getTime()).toBe(b.currentEnd.getTime());
  });
  it('uses half-open intervals so no discussion is counted in both weeks', () => {
    const w = reportWindows(new Date('2026-10-09T02:30:00Z'), 330);
    expect(inWindow(w.currentStart, w.currentStart, w.currentEnd)).toBe(true);
    expect(inWindow(w.currentStart, w.previousStart, w.previousEnd)).toBe(false);
  });
});
