const TZ = 'Asia/Kolkata';
export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts }).format(new Date(iso));
}
export function fmtDateTime(iso: string | null | undefined) {
  return fmtDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
/** Period end is exclusive (local midnight); show the last included day. */
export function lastDay(endExclusive: string) { return new Date(Date.parse(endExclusive) - 1).toISOString(); }
export function fmtPeriod(start: string, endExclusive: string, withYear = true) {
  return `${fmtDate(start)} – ${fmtDate(lastDay(endExclusive), withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : undefined)}`;
}
export function fmtWeekEnd(endExclusive: string) { return fmtDate(lastDay(endExclusive)); }
export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
export function pct(n: number | null | undefined, digits = 0) { return n === null || n === undefined ? '—' : `${(n * 100).toFixed(digits)}%`; }
export function plural(n: number, one: string, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }
