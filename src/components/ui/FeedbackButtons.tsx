'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { chooseVoter, recordFeedback } from '@/app/feedback/actions';
import type { FeedbackType } from '@/lib/queries';
import { applyVote, voteOf, type Tally } from '@/lib/votes';

/** "Who are you?" — one button per teammate. */
export function VoterPicker({ team, onPick, onCancel }: { team: string[]; onPick: (name: string) => void; onCancel?: () => void }) {
  return (
    <div role="group" aria-label="Who are you?" className="flex flex-wrap items-center gap-1.5 rounded-ctl border border-line bg-panel px-2.5 py-1.5 text-[12px]">
      <span className="font-medium text-ink-2">Who are you?</span>
      {team.map((n) => <button key={n} type="button" onClick={() => onPick(n)} className="rounded-full border border-line px-2.5 py-0.5 font-medium text-ink-2 hover:border-violet hover:text-violet-ink">{n}</button>)}
      {onCancel && <button type="button" onClick={onCancel} className="px-1.5 text-ink-muted hover:text-ink">Cancel</button>}
    </div>
  );
}

/** 👍 / 👎 team vote on one AI item. One vote per person; pressing your current vote again removes it. */
export function FeedbackButtons({ reportId, itemType, itemIndex, label, tally: initial, voter: initialVoter, team }: {
  reportId: string; itemType: FeedbackType; itemIndex: number; label: string; tally: Tally; voter: string | null; team: string[];
}) {
  const router = useRouter();
  const [tally, setTally] = useState(initial);
  const [voter, setVoter] = useState(initialVoter);
  const [asking, setAsking] = useState<boolean | null>(null); // the vote waiting for a name
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => setVoter(initialVoter), [initialVoter]);
  useEffect(() => setTally(initial), [initial]);
  const mine = voteOf(tally, voter);

  const vote = (useful: boolean, as: string) => {
    const next = voteOf(tally, as) === useful ? null : useful;
    const prev = tally;
    setTally(applyVote(tally, as, next));
    setError('');
    start(async () => {
      const r = await recordFeedback({ reportId, itemType, itemIndex, useful: next }).catch(() => ({ ok: false, needVoter: false }));
      if (!r.ok) {
        setTally(prev);
        if ('needVoter' in r && r.needVoter) { setVoter(null); setAsking(useful); } else setError('Not saved. Try again.');
      }
    });
  };
  const choose = (useful: boolean) => (voter ? vote(useful, voter) : setAsking(useful));
  const pick = (name: string) => {
    const useful = asking;
    setAsking(null);
    start(async () => {
      const r = await chooseVoter(name);
      if (!r.ok) { setError('Could not remember your name. Try again.'); return; }
      setVoter(name);
      if (useful !== null) vote(useful, name);
      router.refresh(); // other vote groups and "Voting as …" learn the name
    });
  };

  const btn = (useful: boolean) => {
    const on = mine === useful;
    const Icon = useful ? ThumbsUp : ThumbsDown;
    return (
      <button type="button" onClick={() => choose(useful)} disabled={pending} aria-pressed={on} aria-label={useful ? 'Mark useful' : 'Mark not useful'}
        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-60 ${on ? (useful ? 'border-fall bg-fall-soft text-fall' : 'border-rise bg-rise-soft text-rise') : 'border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink'}`}>
        <Icon size={12} aria-hidden="true" />{useful ? 'Useful' : 'Not useful'}
      </button>
    );
  };
  const names = (list: string[]) => (list.length ? list.join(', ') : 'nobody');
  const summary = `${tally.up.length} useful (${names(tally.up)}), ${tally.down.length} not useful (${names(tally.down)})`;

  return (
    <div className="mt-2.5 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Vote on: ${label}`}>
        {btn(true)}{btn(false)}
        {(tally.up.length > 0 || tally.down.length > 0) && (
          <span tabIndex={0} aria-label={`Team votes: ${summary}`} className="group relative ml-1 inline-flex items-center gap-1 rounded-full px-1.5 text-[12px] tabular-nums text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-violet">
            <ThumbsUp size={11} aria-hidden="true" />{tally.up.length}<span aria-hidden="true">·</span><ThumbsDown size={11} aria-hidden="true" />{tally.down.length}
            <span aria-hidden="true" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max max-w-[240px] rounded-ctl bg-coal px-2.5 py-1.5 text-[12px] leading-snug text-coal-text shadow-pop group-hover:block group-focus:block">
              Useful: {names(tally.up)}<br />Not useful: {names(tally.down)}
            </span>
          </span>
        )}
        {error && <span className="text-[12px] text-rise" role="alert">{error}</span>}
      </div>
      {asking !== null && <div className="mt-2"><VoterPicker team={team} onPick={pick} onCancel={() => setAsking(null)} /></div>}
    </div>
  );
}

/** "Voting as Neha · change", shown once near the top of the brief. */
export function VoterBar({ voter, team }: { voter: string | null; team: string[] }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [, start] = useTransition();
  const pick = (name: string) => start(async () => { await chooseVoter(name); setChanging(false); router.refresh(); });
  if (changing) return <VoterPicker team={team} onPick={pick} onCancel={() => setChanging(false)} />;
  return (
    <p className="text-[13px] text-ink-muted print:hidden">
      {voter ? <>Voting as <span className="font-medium text-ink">{voter}</span> · </> : <>Team votes on AI findings: </>}
      <button type="button" onClick={() => setChanging(true)} className="link underline">{voter ? 'change' : 'choose your name'}</button>
    </p>
  );
}
