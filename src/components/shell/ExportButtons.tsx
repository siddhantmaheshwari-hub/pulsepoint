'use client';
import { useState } from 'react';
import { Check, ClipboardCopy, Printer } from 'lucide-react';

/** "Copy for sprint planning" (Markdown built server-side from the stored snapshot) and print. */
export function ExportButtons({ markdown }: { markdown: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={copy} className="pill">
        {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <ClipboardCopy size={14} aria-hidden="true" />}
        {state === 'copied' ? 'Copied as Markdown' : state === 'failed' ? 'Copy blocked by browser' : 'Copy for sprint planning'}
      </button>
      <button type="button" onClick={() => window.print()} className="pill"><Printer size={14} aria-hidden="true" />Print</button>
      <span className="sr-only" role="status" aria-live="polite">{state === 'copied' ? 'Brief copied to clipboard as Markdown' : state === 'failed' ? 'Copy failed' : ''}</span>
    </div>
  );
}
