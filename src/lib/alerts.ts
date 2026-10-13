import { escapeHtml } from './email';

// Failure alerts for the named maintainer. Pure functions (no database, no network) so they can be unit-tested.

export const SOURCE_FAIL_RUNS = 3; // a source must fail this many runs in a row before we alert

type SourceStat = { requests?: number; failures?: number; items?: number; skipped?: string };
export type RunStats = { status: string; started_at: string; sources: Record<string, SourceStat> };

/** A source "failed" in a run when every request it made failed, or the circuit breaker stopped it. */
export function sourceFailedInRun(s: SourceStat | undefined): boolean | null {
  if (!s || s.skipped === 'missing credentials') return null; // not attempted: neither a failure nor a success
  if (s.skipped?.startsWith('stopped after')) return true;
  if (!s.requests) return null;
  return (s.failures ?? 0) >= s.requests;
}

/** Sources that failed in each of their last N attempted runs. `runs` must be newest first. */
export function failingSources(runs: RunStats[], n = SOURCE_FAIL_RUNS): string[] {
  const ids = new Set(runs.flatMap((r) => Object.keys(r.sources ?? {})));
  return [...ids].filter((id) => {
    const attempts = runs.map((r) => sourceFailedInRun(r.sources?.[id])).filter((v): v is boolean => v !== null).slice(0, n);
    return attempts.length === n && attempts.every(Boolean);
  }).sort();
}

/** Remove anything that looks like a credential before it goes into an email. */
export function redactSecrets(s: string): string {
  return s
    .replace(/\b(npg_|napi_|AIza|re_|ghp_|github_pat_|sk-|AQ\.)[A-Za-z0-9_.\-]{6,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(\w+:\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1[redacted]@')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[redacted]')
    .replace(/([?&](?:key|token|secret|password)=)[^&\s]+/gi, '$1[redacted]');
}

export interface Problem { key: string; what: string; detail: string }

/** IST calendar day, so "once per day" matches the maintainer's day. */
export function alertDay(now: Date, tz = 330): string {
  return new Date(now.getTime() + tz * 60_000).toISOString().slice(0, 10);
}

export function buildAlertEmail(p: Problem, when: string, healthUrl: string) {
  const detail = redactSecrets(p.detail).slice(0, 1500);
  const subject = `PulsePoint alert: ${p.what}`;
  const text = [`${p.what}`, '', `When: ${when}`, '', 'Error:', detail || '(no error message)', '', healthUrl ? `System health: ${healthUrl}` : 'Open System health in PulsePoint for details.', '', 'You get at most one alert per problem per day.'].join('\n');
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F5F3EE">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFEFC;border:1px solid #E5E1D8;border-radius:14px">
<tr><td style="padding:24px 28px;${font};color:#17191E">
<p style="margin:0 0 6px;font-size:12px;color:#B03D22;text-transform:uppercase;letter-spacing:.06em">PulsePoint alert</p>
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3">${escapeHtml(p.what)}</h1>
<p style="margin:0 0 10px;font-size:14px;color:#3B4049"><strong>When:</strong> ${escapeHtml(when)}</p>
<p style="margin:0 0 6px;font-size:14px;color:#3B4049"><strong>Error:</strong></p>
<pre style="margin:0 0 18px;padding:12px;background:#EFECE5;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-word">${escapeHtml(detail || '(no error message)')}</pre>
${healthUrl ? `<a href="${escapeHtml(healthUrl)}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#1B1D21;color:#fff;font-size:14px;font-weight:600;text-decoration:none">Open System health</a>` : ''}
<p style="margin:18px 0 0;font-size:12px;color:#5A5F68">You get at most one alert per problem per day.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

// "Once per day per problem", enforced by the database. Params: $1 key, $2 day (YYYY-MM-DD), $3 subject.
export const CLAIM_ALERT_SQL = `
  insert into alerts (key, day, status, subject) values ($1, $2, 'sending', $3)
  on conflict (key, day) do update set status = 'sending', error = null, claimed_at = now()
    where alerts.status = 'failed'
       or (alerts.status = 'sending' and alerts.claimed_at < now() - interval '10 minutes')
  returning key`;
export const MARK_ALERT_SENT_SQL = `update alerts set status = 'sent', sent_at = now() where key = $1 and day = $2`;
export const MARK_ALERT_FAILED_SQL = `update alerts set status = 'failed', error = $3 where key = $1 and day = $2`;
