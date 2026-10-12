import type { ReportWindows } from './windows';
import type { SP } from './params';

// Calendar periods for the Week | Month | Range picker. Pure date maths (no database) so it can be unit-tested.
// Boundaries are local midnights in the report time zone (IST by default). The comparison is always the
// previous period of equal length, immediately before the selected one.

const DAY = 86_400_000;
export const MAX_RANGE_DAYS = 92;

export type Period =
  | { view: 'week' }
  | { view: 'month'; month: string; w: ReportWindows; days: number; label: string }
  | { view: 'range'; from: string; to: string; w: ReportWindows; days: number; label: string }
  | { view: 'month' | 'range'; error: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Local midnight of a calendar date (YYYY-MM-DD) in the report time zone, as a UTC instant. */
function localMidnight(y: number, m: number, d: number, tz: number): number {
  return Date.UTC(y, m - 1, d) - tz * 60_000;
}
function parseDate(s: string | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? [y, mo, d] : null; // rejects 2026-02-30
}
function withPrevious(start: number, end: number): ReportWindows {
  const len = end - start;
  return { currentStart: new Date(start), currentEnd: new Date(end), previousStart: new Date(start - len), previousEnd: new Date(start) };
}
/** YYYY-MM-DD of an instant, in the report time zone. */
export function localDate(t: number, tz = 330): string {
  return new Date(t + tz * 60_000).toISOString().slice(0, 10);
}

export function monthWindow(month: string, tz = 330): { w: ReportWindows; days: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const start = localMidnight(y, mo, 1, tz);
  const end = mo === 12 ? localMidnight(y + 1, 1, 1, tz) : localMidnight(y, mo + 1, 1, tz);
  return { w: withPrevious(start, end), days: Math.round((end - start) / DAY) };
}

/** Inclusive date range: from 00:00 on `from` to the end of `to`. */
export function rangeWindow(from: string, to: string, tz = 330): { w: ReportWindows; days: number } | { error: string } {
  const a = parseDate(from), b = parseDate(to);
  if (!a || !b) return { error: 'Pick a start and an end date.' };
  const start = localMidnight(...a, tz);
  const end = localMidnight(...b, tz) + DAY;
  if (end <= start) return { error: 'The end date must be on or after the start date.' };
  const days = Math.round((end - start) / DAY);
  if (days > MAX_RANGE_DAYS) return { error: `A range can be at most ${MAX_RANGE_DAYS} days (this one is ${days}).` };
  return { w: withPrevious(start, end), days };
}

function fmtDay(s: string, withYear: boolean) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${SHORT[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** Reads ?view=month&m=YYYY-MM or ?view=range&from=YYYY-MM-DD&to=YYYY-MM-DD. Anything else is the weekly view. */
export function parsePeriod(sp: SP, now = new Date(), tz = 330): Period {
  const get = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  const view = get('view');
  if (view === 'month') {
    const month = get('m') ?? localDate(now.getTime(), tz).slice(0, 7);
    const r = monthWindow(month, tz);
    if (!r) return { view, error: 'Pick a month.' };
    const [y, mo] = month.split('-').map(Number);
    return { view, month, ...r, label: `${MONTHS[mo - 1]} ${y}` };
  }
  if (view === 'range') {
    const to = get('to') ?? localDate(now.getTime(), tz);
    const from = get('from') ?? localDate(now.getTime() - 9 * DAY, tz);
    const r = rangeWindow(from, to, tz);
    if ('error' in r) return { view, error: r.error };
    return { view, from, to, ...r, label: `${fmtDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmtDay(to, true)}` };
  }
  return { view: 'week' };
}

/** URL params that carry the period, for links that should keep it. */
export function periodParams(p: Period): Record<string, string> {
  if (p.view === 'month' && 'month' in p) return { view: 'month', m: p.month };
  if (p.view === 'range' && 'from' in p) return { view: 'range', from: p.from, to: p.to };
  return {};
}
