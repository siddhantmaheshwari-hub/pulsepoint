export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(new Date(iso));
}
export function fmtDateTime(iso: string | null | undefined) {
  return fmtDate(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
/** Period end is exclusive (local midnight); show the last included day. */
export function fmtPeriod(start: string, endExclusive: string) {
  const lastDay = new Date(Date.parse(endExclusive) - 1).toISOString();
  return `${fmtDate(start)} – ${fmtDate(lastDay, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
