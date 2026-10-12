'use client';
import { useState, useTransition } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { sendTestEmail } from './actions';

export function TestEmailButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div>
      <button type="button" className="pill-dark" disabled={disabled || pending} onClick={() => start(async () => setMsg(await sendTestEmail()))}>
        {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}
        {pending ? 'Sending…' : 'Send test email'}
      </button>
      <p role="status" className={`mt-2 text-[13px] ${msg ? (msg.ok ? 'text-fall' : 'text-rise') : 'sr-only'}`}>{msg?.message ?? ''}</p>
    </div>
  );
}
