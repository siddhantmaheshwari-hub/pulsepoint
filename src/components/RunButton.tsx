'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'collect' | 'report' | 'full';
const LABEL: Record<Mode, string> = { full: 'Collect & generate brief', collect: 'Collect now', report: 'Regenerate brief' };

export function RunButton({ mode = 'full', primary = false }: { mode?: Mode; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? data.errors?.[0]?.message ?? `Request failed (${res.status})`);
      if (data.status === 'skipped') setMsg({ ok: false, text: data.reason });
      else {
        const a = data.stats?.analyze;
        const remaining = a?.remaining ? ` ${a.remaining} discussions still queued for analysis — run again to finish.` : '';
        setMsg({ ok: data.status !== 'failed', text: `Run ${data.status}. ${a ? `${a.analyzed} analyzed.` : ''}${remaining}${data.errors?.length ? ` ${data.errors.length} issue(s) logged in Collection status.` : ''}` });
      }
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={run} disabled={busy} className={primary ? 'btn btn-primary' : 'btn'}>
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
        {busy ? 'Running… (up to 4 min)' : LABEL[mode]}
      </button>
      {msg && <p role="status" className={`max-w-sm text-xs ${msg.ok ? 'text-muted' : 'text-signal'}`}>{msg.text}</p>}
    </div>
  );
}
