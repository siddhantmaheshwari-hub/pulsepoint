import { PageHeader } from '@/components/ui/bits';
import { maskEmail, parseRecipients } from '@/lib/email';
import { emailConfigured, lastBriefEmail } from '@/lib/email-send';
import { env } from '@/lib/env';
import { fmtDateTime, fmtWeekEnd } from '@/lib/format';
import { ANALYSIS_VERSION } from '@/lib/pipeline/prompts';
import { TREND_RULES } from '@/lib/trends';
import { parseTeam } from '@/lib/votes';
import { TestEmailButton } from './TestEmailButton';

// Read-only view of configuration. Secret values are never read into the page — only whether they are set.
const set = (k: string) => Boolean(process.env[k]);

export default async function SettingsPage() {
  const recipients = parseRecipients(env.briefRecipients);
  const emailOn = emailConfigured();
  const last = await lastBriefEmail();
  const tz = Number(process.env.REPORT_TZ_OFFSET_MINUTES ?? 330);
  const rows: [string, string, string][] = [
    ['Database (DATABASE_URL)', set('DATABASE_URL') ? 'Connected' : 'Missing', 'Neon Postgres, pooled connection'],
    ['Gemini key (GEMINI_API_KEY)', set('GEMINI_API_KEY') ? 'Set' : 'Missing', `Model: ${env.geminiModel}`],
    ['Scheduler secret (CRON_SECRET)', set('CRON_SECRET') ? 'Set' : 'Missing', 'Protects the scheduled endpoints'],
    ['Dashboard access', 'Open — no sign-in', 'Testing build: anyone with the link can view and make changes'],
    ['Stack Exchange key', set('STACKEXCHANGE_KEY') ? 'Set (10,000 requests/day)' : 'Not set (300 requests/day)', 'Optional'],
    ['GitHub token', set('GITHUB_TOKEN') ? 'Set' : 'Not set', 'Optional; enables GitHub Issues'],
    ['Slack notification', set('SLACK_WEBHOOK_URL') ? 'On' : 'Off', 'Optional Friday message'],
    ['Team (TEAM_MEMBERS)', parseTeam(env.teamMembers).join(', '), set('TEAM_MEMBERS') ? 'Who can vote on AI findings' : 'Default team; set TEAM_MEMBERS to change'],
  ];
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" lead="How PulsePoint is configured. Values are managed in environment variables (.env.local or Vercel → Settings → Environment Variables); keys are never shown here." />
      <section className="panel overflow-hidden">
        <h2 className="h-panel px-6 pt-5">Connections</h2>
        <dl className="mt-3 divide-y divide-line">{rows.map(([k, v, n]) => (
          <div key={k} className="grid gap-1 px-6 py-3.5 text-sm sm:grid-cols-[1fr_1fr_1.2fr]"><dt className="font-medium">{k}</dt><dd className={v.startsWith('Missing') ? 'text-rise' : 'text-ink-2'}>{v}</dd><dd className="text-ink-muted">{n}</dd></div>
        ))}</dl>
      </section>
      <section className="panel panel-pad mt-6">
        <h2 className="h-panel">Email</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-ink-muted">Friday brief email</dt><dd className={emailOn ? 'text-ink-2' : 'text-rise'}>{emailOn ? 'Configured' : 'Not configured (needs RESEND_API_KEY and BRIEF_RECIPIENTS)'}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-ink-muted">Recipients</dt><dd className="break-all text-ink-2">{recipients.length ? recipients.map(maskEmail).join(', ') : 'None'}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-ink-muted">Last brief emailed</dt><dd className={last?.status === 'failed' ? 'text-rise' : 'text-ink-2'}>{
            !last ? 'Never'
              : last.status === 'sent' ? `${fmtDateTime(last.sent_at)} (week ending ${fmtWeekEnd(last.period_end)})`
              : last.status === 'failed' ? `Failed ${fmtDateTime(last.claimed_at)}: ${last.error ?? 'unknown error'}`
              : 'Sending…'
          }</dd></div>
        </dl>
        <div className="mt-4"><TestEmailButton disabled={!emailOn} /></div>
        <p className="meta mt-3">The test email sends the latest brief to the recipients above. Each week&apos;s brief is emailed once, right after the Friday report; if that fails, the Friday 06:30 run sends it.</p>
      </section>
      <section className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="panel panel-pad">
          <h2 className="h-panel">Schedule</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Daily collection</dt><dd>06:30 IST (01:00 UTC)</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Friday brief</dt><dd>Friday 06:00 IST (00:30 UTC)</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Weeks end at</dt><dd>Local midnight (UTC{tz >= 0 ? '+' : '−'}{Math.floor(Math.abs(tz) / 60)}:{String(Math.abs(tz) % 60).padStart(2, '0')})</dd></div>
          </dl>
          <p className="meta mt-4">Change the schedule in <code>vercel.json</code> and redeploy.</p>
        </div>
        <div className="panel panel-pad">
          <h2 className="h-panel">Trend rules</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Rising or easing needs</dt><dd>±{TREND_RULES.minAbsChange} discussions and ±{TREND_RULES.minPctChange}%</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Underserved needs</dt><dd>2+ discussions, ≥50% unresolved</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-muted">Analysis version</dt><dd>{ANALYSIS_VERSION}</dd></div>
          </dl>
          <p className="meta mt-4">Counts and trends are computed in code, never by the AI model.</p>
        </div>
      </section>
    </div>
  );
}
