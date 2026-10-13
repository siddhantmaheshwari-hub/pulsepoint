import { GenerateButton } from '@/components/shell/GenerateButton';
import { SetupNotice } from '@/components/SetupNotice';
import { AiMark, Empty, PageHeader, SourceChip, Sufficiency } from '@/components/ui/bits';
import { TrendTag } from '@/components/ui/Trend';
import { loadBrief } from '@/lib/brief';
import { missingEnv } from '@/lib/env';
import { fmtDate, fmtPeriod } from '@/lib/format';
import { compareOn, type SP } from '@/lib/params';
import type { EvidenceItem, TopicMetricRow } from '@/lib/types';
export const metadata = { title: 'Opportunities' };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const compare = compareOn(sp);
  const { report, metrics, topicNames } = await loadBrief(sp);
  if (!report) return <><PageHeader title="Opportunities" /><Empty title="No report yet" action={<GenerateButton />}>Opportunities are identified from the weekly report.</Empty></>;

  const s = report.synthesis;
  const evidence = new Map<string, EvidenceItem>(metrics.flatMap((m) => m.evidence.map((e) => [e.discussion_id, e] as const)));
  const opps = metrics.filter((m) => m.underserved);
  const leads = metrics.filter((m) => !m.underserved && m.current_count === 1 && (m.trend === 'new' || m.unresolved_count === 1));

  return (
    <div>
      <PageHeader title="Opportunities" lead={<>Problems developers keep raising that existing tools don’t seem to solve, for {fmtPeriod(report.period_start, report.period_end)}. A problem qualifies only with 2+ discussions this week and at least half unresolved.</>} />

      {opps.length ? (
        <div className="space-y-5">
          {opps.map((m, i) => <Opportunity key={m.pain_point_key} m={m} rank={i + 1} topic={m.topic_slug ? topicNames[m.topic_slug] : null} why={s?.underserved.find((u) => u.pain_point_key === m.pain_point_key)} evidence={evidence} compare={compare} periodStart={report.period_start} />)}
        </div>
      ) : <Empty title="No pain point qualifies this week">Nothing recurred with mostly unresolved discussions. Check the leads below, or widen your keywords.</Empty>}

      {s?.investigate.length ? (
        <section className="mt-12" aria-labelledby="inv-h">
          <div className="flex items-center gap-2"><h2 id="inv-h" className="text-[20px] font-semibold tracking-[-0.015em]">Questions worth investigating</h2><AiMark label="AI" /></div>
          <p className="meta mt-1">Suggestions for interviews and demos. Prioritisation stays with you.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {s.investigate.map((r, i) => (
              <article key={i} className="rounded-panel border border-violet-line bg-violet-soft/40 p-5">
                <p className="font-medium leading-snug">{r.recommendation}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{r.rationale}</p>
                <Links ids={r.evidence_ids} map={evidence} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {leads.length > 0 && (
        <section className="mt-12" aria-labelledby="leads-h">
          <h2 id="leads-h" className="text-[20px] font-semibold tracking-[-0.015em]">Early leads</h2>
          <p className="meta mt-1">Single discussions. Not opportunities yet — watch whether they recur next week.</p>
          <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-panel">
            {leads.map((m) => (
              <li key={m.pain_point_key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm">
                <span className="font-medium">{m.label}</span><span className="meta">{m.topic_slug ? topicNames[m.topic_slug] : 'Uncategorised'}</span>
                {m.evidence[0] && <a href={m.evidence[0].url} target="_blank" rel="noopener noreferrer nofollow" className="link relative ml-auto truncate text-[13px]">{m.evidence[0].title}<span className="sr-only"> (opens in new tab)</span></a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Opportunity({ m, rank, topic, why, evidence, compare, periodStart }: { m: TopicMetricRow; rank: number; topic: string | null; why?: { why: string; evidence_ids: string[] }; evidence: Map<string, EvidenceItem>; compare: boolean; periodStart: string }) {
  const workarounds = [...new Set(m.evidence.map((e) => e.workaround).filter(Boolean))] as string[];
  const recurring = m.first_observed ? Date.parse(m.first_observed) < Date.parse(periodStart) : false;
  const limits = [m.sufficiency !== 'sufficient' && 'limited volume', m.distinct_sources < 2 && 'single source', (m.verified_share ?? 0) < 0.5 && 'few verified quotes'].filter(Boolean) as string[];
  return (
    <article className="grid gap-6 rounded-panel border border-line bg-panel p-6 md:grid-cols-12 md:p-7">
      <div className="md:col-span-7">
        <p className="eyebrow">Opportunity {rank} · {topic ?? 'Uncategorised'}</p>
        <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{m.label}</h2>
        {why ? <div className="mt-3"><AiMark label="Why it matters" /><p className="mt-2 text-[15px] leading-relaxed text-ink-2">{why.why}</p></div>
          : <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{m.unresolved_count} of {m.current_count} discussions this week end without a satisfying fix.</p>}
        {workarounds.length > 0 && (
          <div className="mt-4"><p className="text-[13px] font-medium">Workarounds in use</p><ul className="mt-1 flex flex-wrap gap-1.5">{workarounds.map((w) => <li key={w} className="tag bg-sunk text-ink-2">{w}</li>)}</ul></div>
        )}
        <Links ids={why?.evidence_ids?.length ? why.evidence_ids : m.evidence.map((e) => e.discussion_id)} map={evidence} max={4} />
      </div>
      <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-5 border-t border-line pt-5 md:col-span-5 md:border-l md:border-t-0 md:pl-7 md:pt-0">
        <div><dt className="meta">Discussions this week</dt><dd className="mt-1 text-[32px] font-light leading-none">{m.current_count}</dd></div>
        <div><dt className="meta">Unresolved</dt><dd className="mt-1 text-[32px] font-light leading-none text-rise">{m.unresolved_count}</dd></div>
        <div><dt className="meta">Pattern</dt><dd className="mt-1 text-sm font-medium">{recurring ? `Recurring since ${fmtDate(m.first_observed)}` : 'New this week'}</dd></div>
        {compare && <div><dt className="meta">vs last week</dt><dd className="mt-1"><TrendTag trend={m.trend} pct={m.pct_change} size="sm" /></dd></div>}
        <div><dt className="meta">Confidence</dt><dd className="mt-1"><Sufficiency value={m.sufficiency} /><span className="block text-xs text-ink-muted">avg model confidence {m.avg_confidence ?? '—'}</span></dd></div>
        <div><dt className="meta">Limitations</dt><dd className="mt-1 text-xs text-ink-2">{limits.length ? limits.join(', ') : 'none flagged'}</dd></div>
      </dl>
    </article>
  );
}

function Links({ ids, map, max = 3 }: { ids: string[]; map: Map<string, EvidenceItem>; max?: number }) {
  const items = ids.map((id) => map.get(id)).filter(Boolean) as EvidenceItem[];
  if (!items.length) return null;
  return (
    <ul className="mt-4 space-y-1.5">
      {items.slice(0, max).map((e) => (
        <li key={e.discussion_id} className="flex items-center gap-2 text-[13px]"><SourceChip id={e.source_id} />
          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="relative truncate text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-violet-ink">{e.title}<span className="sr-only"> (opens in new tab)</span></a>
        </li>
      ))}
    </ul>
  );
}
