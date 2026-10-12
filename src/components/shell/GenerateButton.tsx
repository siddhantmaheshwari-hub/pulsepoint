'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

type Mode = 'collect' | 'report' | 'full';
const LABEL: Record<Mode, string> = { full: 'Generate report', collect: 'Collect now', report: 'Rebuild report' };

export function GenerateButton({ mode = 'full', variant = 'dark' }: { mode?: Mode; variant?: 'dark' | 'light' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function run() {
    setBusy(true); setMsg(null); setSecs(0);
    timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    try {
      const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? data.errors?.[0]?.message ?? `Request failed (${res.status})`);
      if (data.status === 'skipped') setMsg({ ok: false, text: data.reason });
      else {
        const a = data.stats?.analyze;
        const queued = a?.remaining ? ` ${a.remaining} discussions still queued — run again to finish.` : '';
        setMsg({ ok: data.status !== 'failed', text: `Run ${data.status}.${a ? ` ${a.analyzed} analysed.` : ''}${queued}${data.errors?.length ? ` ${data.errors.length} issue(s) — see System health.` : ''}` });
      }
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={run} disabled={busy} className={variant === 'dark' ? 'pill-dark' : 'pill'}>
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
        {busy ? `Working… ${secs}s` : LABEL[mode]}
      </button>
      {msg && (
        <div role="status" className="absolute right-0 top-11 z-30 w-72 rounded-ctl border border-line bg-panel p-3 text-[13px] shadow-pop">
          <p className={msg.ok ? 'text-ink-2' : 'text-rise'}>{msg.text}</p>
          <button type="button" className="mt-2 text-[12px] font-medium text-ink-muted hover:text-ink" onClick={() => setMsg(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
