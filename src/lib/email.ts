import { trendLabel } from './export';
import type { Synthesis, TopicMetricRow } from './types';

// The Friday brief as an email. Pure functions only (no database, no network) so they can be unit-tested.
// Numbers come from the stored report snapshot; AI-written text is labelled "AI reading".

export interface BriefEmailInput {
  reportId: string;
  periodLabel: string;
  appUrl: string; // may be empty: then the "Open the full brief" button is left out
  totals: Record<string, number>;
  metrics: TopicMetricRow[];
  synthesis: Synthesis | null;
}

export interface BriefEmail { subject: string; html: string; text: string }

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only http(s) links go into the email; anything else is dropped. */
function safeUrl(u: string | null | undefined): string | null {
  return u && /^https?:\/\//i.test(u) ? u : null;
}

/** "sumit@gmail.com" → "s***@gmail.com" (Settings shows recipients without exposing them). */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

/** Comma-separated env value → clean list of addresses. */
export function parseRecipients(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

// "Never twice" rule, enforced by the database. Claim the week's email before sending:
// a row is returned only if nothing was claimed for this period yet, or the earlier attempt failed / got stuck.
// Params: $1 report_id, $2 period_end, $3 recipients.
export const CLAIM_SQL = `
  insert into brief_emails (report_id, period_end, recipients, status)
  values ($1, $2, $3, 'sending')
  on conflict (period_end) do update
    set report_id = excluded.report_id, recipients = excluded.recipients, status = 'sending', error = null, claimed_at = now()
    where brief_emails.status = 'failed'
       or (brief_emails.status = 'sending' and brief_emails.claimed_at < now() - interval '10 minutes')
  returning id`;
export const MARK_SENT_SQL = `update brief_emails set status = 'sent', sent_at = now() where id = $1`;
export const MARK_FAILED_SQL = `update brief_emails set status = 'failed', error = $2 where id = $1`;

const C = {
  paper: '#F5F3EE', panel: '#FFFEFC', line: '#E5E1D8', ink: '#17191E', ink2: '#3B4049', muted: '#5A5F68',
  violet: '#4337C9', violetSoft: '#ECE9FD', coal: '#1B1D21', rise: '#B03D22', fall: '#25684F', fresh: '#7E5306',
};
const FONT = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

function trendColor(m: TopicMetricRow) {
  return m.trend === 'rising' ? C.rise : m.trend === 'declining' ? C.fall : m.trend === 'new' ? C.fresh : C.muted;
}
const aiMark = `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${C.violetSoft};color:${C.violet};font-size:11px;font-weight:600;letter-spacing:.02em">AI reading</span>`;

export function buildBriefEmail({ reportId, periodLabel, appUrl, totals: t, metrics, synthesis: s }: BriefEmailInput): BriefEmail {
  const n = (k: string) => Number(t[k] ?? 0);
  const briefUrl = appUrl ? `${appUrl.replace(/\/+$/, '')}/?report=${encodeURIComponent(reportId)}` : null;
  const evidence = new Map(metrics.flatMap((m) => m.evidence.map((e) => [e.discussion_id, e] as const)));
  const firstLink = (ids: string[]) => ids.map((id) => evidence.get(id)).find((e) => e && safeUrl(e.url)) ?? null;

  const top = metrics.filter((m) => m.current_count > 0).slice(0, 5);
  const underserved = metrics.filter((m) => m.underserved);
  const investigate = s?.investigate ?? [];
  const headline = s?.headline?.trim() || null;
  const summary = `${n('pain_discussions')} discussions described a workflow pain or unmet need this week (${n('pain_discussions_previous')} the week before), across ${n('pain_points_tracked')} pain points: ${n('rising')} rising, ${n('new')} new, ${n('declining')} easing.`;
  const subject = `PulsePoint Friday brief: ${periodLabel}`;

  // ---------- HTML ----------
  const h: string[] = [];
  const section = (title: string, aiNote = false) =>
    h.push(`<tr><td style="padding:24px 28px 8px"><h2 style="margin:0;font-size:15px;color:${C.ink};${FONT}">${escapeHtml(title)}${aiNote ? ` &nbsp;${aiMark}` : ''}</h2></td></tr>`);
  const link = (url: string, label: string) => `<a href="${escapeHtml(url)}" style="color:${C.violet};text-decoration:underline">${escapeHtml(label)}</a>`;

  h.push(`<tr><td style="padding:28px 28px 4px;${FONT}"><p style="margin:0;font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em">PulsePoint · Friday brief · ${escapeHtml(periodLabel)}</p></td></tr>`);
  if (headline) h.push(`<tr><td style="padding:10px 28px 0;${FONT}"><h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${C.ink}">${escapeHtml(headline)}</h1>${aiMark}</td></tr>`);
  else h.push(`<tr><td style="padding:10px 28px 0;${FONT}"><h1 style="margin:0;font-size:22px;line-height:1.3;color:${C.ink}">This week's developer pain points</h1></td></tr>`);
  h.push(`<tr><td style="padding:14px 28px 0;${FONT}"><p style="margin:0;font-size:14px;line-height:1.55;color:${C.ink2}">${escapeHtml(summary)} <span style="color:${C.muted}">Counts are computed by code.</span></p></td></tr>`);

  if (top.length) {
    section('Top pain points');
    h.push(`<tr><td style="padding:0 28px;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`);
    for (const m of top) {
      const ev = m.evidence.find((e) => safeUrl(e.url));
      h.push(`<tr><td style="padding:10px 0;border-top:1px solid ${C.line};font-size:14px;line-height:1.45;color:${C.ink}">
        <strong>${escapeHtml(m.label)}</strong><br>
        <span style="color:${C.ink2}">${m.current_count} this week · ${m.previous_count} last week · </span><span style="color:${trendColor(m)};font-weight:600">${escapeHtml(trendLabel(m.trend, m.pct_change))}</span>
        ${ev ? `<br><span style="font-size:13px;color:${C.muted}">Evidence: </span><span style="font-size:13px">${link(ev.url, ev.title)}</span>` : ''}
      </td></tr>`);
    }
    h.push(`</table></td></tr>`);
  }

  if (underserved.length) {
    section('Underserved problems', underserved.some((m) => s?.underserved.some((u) => u.pain_point_key === m.pain_point_key)));
    h.push(`<tr><td style="padding:0 28px;${FONT}"><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5;color:${C.ink}">`);
    for (const m of underserved) {
      const why = s?.underserved.find((u) => u.pain_point_key === m.pain_point_key);
      const ev = firstLink(why?.evidence_ids ?? []) ?? m.evidence.find((e) => safeUrl(e.url)) ?? null;
      h.push(`<li style="margin:0 0 10px"><strong>${escapeHtml(m.label)}</strong>: ${m.unresolved_count} of ${m.current_count} unresolved.${why ? ` <span style="color:${C.ink2}">${escapeHtml(why.why)}</span>` : ''}${ev ? `<br><span style="font-size:13px">${link(ev.url, ev.title)}</span>` : ''}</li>`);
    }
    h.push(`</ul></td></tr>`);
  }

  if (investigate.length) {
    section('Worth investigating (suggestions, not decisions)', true);
    h.push(`<tr><td style="padding:0 28px;${FONT}"><ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:${C.ink}">`);
    for (const r of investigate) {
      const ev = firstLink(r.evidence_ids);
      h.push(`<li style="margin:0 0 10px"><strong>${escapeHtml(r.recommendation)}</strong> <span style="color:${C.ink2}">${escapeHtml(r.rationale)}</span>${ev ? `<br><span style="font-size:13px">${link(ev.url, ev.title)}</span>` : ''}</li>`);
    }
    h.push(`</ol></td></tr>`);
  }

  if (briefUrl) {
    h.push(`<tr><td style="padding:24px 28px 8px;${FONT}"><a href="${escapeHtml(briefUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${C.coal};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Open the full brief</a></td></tr>`);
  }
  h.push(`<tr><td style="padding:16px 28px 28px;${FONT}"><p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted}">Sent by PulsePoint. Evidence links go to public community discussions. Text marked "AI reading" is written by Gemini Flash from cited evidence; all numbers are computed by code.</p></td></tr>`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.panel};border:1px solid ${C.line};border-radius:14px">
${h.join('\n')}
</table></td></tr></table></body></html>`;

  // ---------- Plain text ----------
  const p: string[] = [`PulsePoint Friday brief: ${periodLabel}`, ''];
  if (headline) p.push(`${headline} (AI reading)`, '');
  p.push(summary, 'Counts are computed by code.', '');
  if (top.length) {
    p.push('TOP PAIN POINTS');
    for (const m of top) {
      const ev = m.evidence.find((e) => safeUrl(e.url));
      p.push(`- ${m.label}: ${m.current_count} this week, ${m.previous_count} last week, ${trendLabel(m.trend, m.pct_change)}`);
      if (ev) p.push(`  Evidence: ${ev.title} ${ev.url}`);
    }
    p.push('');
  }
  if (underserved.length) {
    p.push('UNDERSERVED PROBLEMS');
    for (const m of underserved) {
      const why = s?.underserved.find((u) => u.pain_point_key === m.pain_point_key);
      p.push(`- ${m.label}: ${m.unresolved_count} of ${m.current_count} unresolved.${why ? ` AI reading: ${why.why}` : ''}`);
    }
    p.push('');
  }
  if (investigate.length) {
    p.push('WORTH INVESTIGATING (AI suggestions, not decisions)');
    investigate.forEach((r, i) => p.push(`${i + 1}. ${r.recommendation}: ${r.rationale}`));
    p.push('');
  }
  if (briefUrl) p.push(`Open the full brief: ${briefUrl}`);
  const text = p.join('\n').trim() + '\n';

  return { subject, html, text };
}
