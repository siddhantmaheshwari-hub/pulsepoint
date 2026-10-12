'use client';
import { useState, useTransition } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { recordFeedback } from '@/app/feedback/actions';
import type { FeedbackType } from '@/lib/queries';

/** "Useful / Not useful" on one AI item. Pressing the active choice again clears it. */
export function FeedbackButtons({ reportId, itemType, itemIndex, initial, label }: { reportId: string; itemType: FeedbackType; itemIndex: number; initial: boolean | null; label: string }) {
  const [value, setValue] = useState<boolean | null>(initial);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const choose = (useful: boolean) => {
    const next = value === useful ? null : useful;
    const prev = value;
    setValue(next);
    setError(false);
    start(async () => {
      const r = await recordFeedback({ reportId, itemType, itemIndex, useful: next }).catch(() => ({ ok: false }));
      if (!r.ok) { setValue(prev); setError(true); }
    });
  };
  const btn = (useful: boolean) => {
    const on = value === useful;
    const Icon = useful ? ThumbsUp : ThumbsDown;
    return (
      <button type="button" onClick={() => choose(useful)} disabled={pending} aria-pressed={on}
        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-60 ${on ? (useful ? 'border-fall bg-fall-soft text-fall' : 'border-rise bg-rise-soft text-rise') : 'border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink'}`}>
        <Icon size={12} aria-hidden="true" />{useful ? 'Useful' : 'Not useful'}
      </button>
    );
  };
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 print:hidden" role="group" aria-label={`Rate: ${label}`}>
      {btn(true)}{btn(false)}
      {error && <span className="text-[12px] text-rise" role="alert">Not saved. Try again.</span>}
    </div>
  );
}
