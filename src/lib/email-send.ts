import 'server-only';
import { Resend } from 'resend';
import { db } from './db';
import { buildBriefEmail, CLAIM_SQL, MARK_FAILED_SQL, MARK_SENT_SQL, parseRecipients, type BriefEmail } from './email';
import { env } from './env';
import { fmtPeriod } from './format';
import { getMetrics, getReport, type ReportRow } from './queries';
import { reportWindows } from './windows';

export type SendResult = { status: 'sent' | 'already_sent' | 'no_report' | 'not_configured' | 'not_friday' | 'failed'; error?: string };

export function emailConfigured(): boolean {
  return Boolean(env.resendKey) && parseRecipients(env.briefRecipients).length > 0;
}

async function emailFor(report: ReportRow): Promise<BriefEmail> {
  return buildBriefEmail({
    reportId: report.id, periodLabel: fmtPeriod(report.period_start, report.period_end), appUrl: env.appUrl,
    totals: report.totals, metrics: await getMetrics(report.id), synthesis: report.synthesis,
  });
}

async function deliver(email: BriefEmail, to: string[]): Promise<void> {
  const { error } = await new Resend(env.resendKey!).emails.send({ from: env.briefFrom, to, subject: email.subject, html: email.html, text: email.text });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/** True on Friday in the report time zone (IST by default). */
export function isReportFriday(now = new Date()): boolean {
  return new Date(now.getTime() + env.tzOffsetMinutes * 60_000).getUTCDay() === 5;
}

/**
 * Emails this week's brief exactly once. Called by the weekly cron after the report is saved, and by the
 * Friday daily cron as a catch-up. The brief_emails claim (CLAIM_SQL) makes a second send impossible.
 */
export async function sendWeeklyBrief(now = new Date()): Promise<SendResult> {
  if (!emailConfigured()) return { status: 'not_configured' };
  const sql = db();
  const end = reportWindows(now, env.tzOffsetMinutes).currentEnd.toISOString();
  const [report] = await sql<ReportRow[]>`select * from reports where period_end = ${end} order by version desc limit 1`;
  if (!report) return { status: 'no_report' };
  const to = parseRecipients(env.briefRecipients);
  const [claim] = await sql.unsafe<{ id: string }[]>(CLAIM_SQL, [report.id, end, to.join(',')]);
  if (!claim) return { status: 'already_sent' };
  try {
    await deliver(await emailFor(report), to);
    await sql.unsafe(MARK_SENT_SQL, [claim.id]);
    return { status: 'sent' };
  } catch (e) {
    const error = (e as Error).message.slice(0, 300);
    await sql.unsafe(MARK_FAILED_SQL, [claim.id, error]);
    return { status: 'failed', error };
  }
}

/** Settings → "Send test email": the latest brief, marked as a test. Not recorded, so it never blocks the real Friday email. */
export async function sendTestBrief(): Promise<SendResult> {
  if (!emailConfigured()) return { status: 'not_configured' };
  const report = await getReport(null);
  if (!report) return { status: 'no_report' };
  try {
    const email = await emailFor(report);
    await deliver({ ...email, subject: `[Test] ${email.subject}` }, parseRecipients(env.briefRecipients));
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message.slice(0, 300) };
  }
}

export interface LastBriefEmail { status: string; period_end: string; claimed_at: string; sent_at: string | null; error: string | null }
export async function lastBriefEmail(): Promise<LastBriefEmail | null> {
  try {
    const [row] = await db()<LastBriefEmail[]>`select status, period_end, claimed_at, sent_at, error from brief_emails order by claimed_at desc limit 1`;
    return row ?? null;
  } catch {
    return null; // table not migrated yet
  }
}
