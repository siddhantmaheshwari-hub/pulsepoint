'use server';
import { sendTestBrief } from '@/lib/email-send';

// No sign-in in this testing build: anyone with the link can send the test email (it only goes to BRIEF_RECIPIENTS).
const MESSAGE: Record<string, string> = {
  sent: 'Test email sent. Check the inbox (and spam) in a minute.',
  not_configured: 'Email is not configured: set RESEND_API_KEY and BRIEF_RECIPIENTS.',
  no_report: 'There is no brief yet. Generate a report first.',
};

export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const r = await sendTestBrief();
  return { ok: r.status === 'sent', message: MESSAGE[r.status] ?? `Could not send: ${r.error ?? r.status}` };
}
