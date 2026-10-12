'use client';
import { useCallback, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { TopicMetricRow } from '@/lib/types';
import { Lollipops } from '../viz/Lollipops';
import { EvidenceDrawer } from './EvidenceDrawer';

const WHY: Record<string, string> = { rising: 'Biggest rise this week', new: 'Newly observed this week', stable: 'Most discussed this week', declining: 'Most discussed this week', gone: 'Most discussed', none: 'Most discussed' };

export function LeadSignal({ m, history, labels, topicName, periodStart, compare }: { m: TopicMetricRow; history: (number | null)[]; labels: string[]; topicName: string | null; periodStart: string; compare: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const quote = m.evidence.find((e) => e.quote)?.quote;
  // Colour carries meaning: vermilion = rising, amber = newly observed, teal = neutral volume.
  const accent = m.trend === 'rising' ? '#F08A6A' : m.trend === 'new' ? '#E3B33E' : '#7FA6A2';
  return (
    <section aria-labelledby="lead-h" className="flex flex-col rounded-panel bg-coal p-6 text-coal-text md:p-7">
      <p className="text-[13px] font-medium" style={{ color: accent }}>{WHY[m.trend]}</p>
      <h2 id="lead-h" className="mt-2 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em]">{m.label}</h2>
      <p className="mt-1 text-[13px] text-coal-muted">{topicName ?? 'Uncategorised'}</p>
      <div className="mt-6 flex items-end gap-6">
        <div><span className="text-[56px] font-light leading-none tracking-[-0.04em]">{m.current_count}</span><span className="ml-2 text-[13px] text-coal-muted">discussions</span></div>
        {compare && (
          <div className="pb-1.5 text-[13px] text-coal-muted">
            {m.trend === 'new' ? 'none the week before' : <>vs {m.previous_count} the week before{m.pct_change !== null && <span className="ml-2 font-medium" style={{ color: accent }}>{m.pct_change > 0 ? '+' : ''}{m.pct_change}%</span>}</>}
          </div>
        )}
      </div>
      <div className="mt-6"><Lollipops values={history.length ? history : [m.current_count]} labels={labels.length ? labels : ['This week']} accent={accent} label={`${m.label} weekly history`} /></div>
      {quote && <blockquote className="mt-6 border-l border-coal-3 pl-3 text-[14px] leading-relaxed text-coal-text/85">“{quote}”</blockquote>}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-[13px] text-coal-muted">
        <span>{m.unresolved_count} of {m.current_count} unresolved</span>
        <span>{m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}</span>
        <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-coal-text px-4 font-medium text-coal hover:bg-white">
          Open evidence<ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
      {open && <EvidenceDrawer m={m} history={history} labels={labels} topicName={topicName} periodStart={periodStart} compare={compare} onClose={close} />}
    </section>
  );
}
