import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LeadSignal } from '@/components/pain/LeadSignal';
import { PainTable } from '@/components/pain/PainTable';
import { ExportButtons } from '@/components/shell/ExportButtons';
import { GenerateButton } from '@/components/shell/GenerateButton';
import { AiMark, Empty, Metric, SourceChip } from '@/components/ui/bits';
import { FeedbackButtons, VoterBar } from '@/components/ui/FeedbackButtons';
import { TrendTag } from '@/components/ui/Trend';
import { PeriodView } from '@/components/PeriodView';
import { SetupNotice } from '@/components/SetupNotice';
import { SegmentBar } from '@/components/viz/SegmentBar';
import { VolumeChart } from '@/components/viz/VolumeChart';
import { loadBrief } from '@/lib/brief';
import { env, missingEnv } from '@/lib/env';
import { briefMarkdown } from '@/lib/export';
import { fmtDateTime, fmtPeriod, plural } from '@/lib/format';
import { compareOn, type SP } from '@/lib/params';
import { parsePeriod } from '@/lib/periods';
import { getFeedback, getSourceBreakdown, getWeeklyVolume, type DataQuality } from '@/lib/queries';
import { computeTrend } from '@/lib/trends';
import { getVoting } from '@/lib/voter';
import { SOURCE_LABEL, type EvidenceItem, type SourceId, type TopicMetricRow } from '@/lib/types';

export default async function BriefPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const compare = compareOn(sp);

  // Month / Range: numbers computed from stored data, no AI (the AI brief is weekly).
  const period = parsePeriod(sp, new Date(), env.tzOffsetMinutes);
  if (period.view !== 'week') {
    if ('error' in period) return <Empty title="That period can’t be shown" action={<Link href="/" className="pill">Back to this week</Link>}>{period.error}</Empty>;
    return <PeriodView period={period} compare={compare} />;
  }

  const { report, metrics, sparks, sparkLabels, topicNames, sources } = await loadBrief(sp);

  if (!report) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <p className="eyebrow">Friday brief</p>
        <h1 className="mt-2 text-display font-semibold">Your first brief is one run away</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">PulsePoint collects discussions from Hacker News and Stack Overflow for your monitored keywords, reads them with Gemini Flash, and compares this week with last week. The first run looks back 15 days so the comparison works from day one.</p>
        <div className="mt-6 flex flex-wrap gap-3"><GenerateButton /><Link href="/topics" className="pill">Review keywords first</Link></div>
        <p className="mt-4 text-sm text-ink-muted">A run takes up to four minutes. If discussions are still queued afterwards, run it again.</p>
      </div>
    );
  }

  const [volume, bySource, feedback, { team, voter }] = await Promise.all([getWeeklyVolume(report.period_end, report.analysis_version), getSourceBreakdown(report), getFeedback(report.id), getVoting()]);
  const votes = (type: string, i: number) => ({ tally: feedback[`${type}:${i}`] ?? { up: [], down: [] }, voter, team });
  const t = report.totals, s = report.synthesis, dq = report.data_quality;
  const active = metrics.filter((m) => m.current_count > 0);
  const recurring = active.filter((m) => m.first_observed && Date.parse(m.first_observed) < Date.parse(report.period_start));
  // The focal panel needs enough data to deserve it: a lone new anecdote never outranks the most-discussed problem.
  const lead = metrics.filter((m) => (m.trend === 'rising' || m.trend === 'new') && m.sufficiency !== 'insufficient').sort((a, b) => b.abs_change - a.abs_change || b.current_count - a.current_count)[0]
    ?? [...active].sort((a, b) => b.current_count - a.current_count)[0];
  const evidence = new Map<string, EvidenceItem>(metrics.flatMap((m) => m.evidence.map((e) => [e.discussion_id, e] as const)));
  const label = new Map(metrics.map((m) => [m.pain_point_key, m.label]));
  const underserved = metrics.filter((m) => m.underserved).slice(0, 3);
  const topicMoves = topicMovement(metrics, topicNames);
  const sourcesEnabled = sources.filter((x) => x.is_enabled).length;
  const markdown = briefMarkdown({ periodLabel: fmtPeriod(report.period_start, report.period_end), url: env.appUrl ? `${env.appUrl}/?report=${report.id}` : null, totals: t, metrics, synthesis: s });
  const summary = `${plural(t.pain_discussions, 'discussion')} described a workflow pain or unmet need this week, across ${plural(t.pain_points_tracked, 'pain point')}${compare ? ` (${t.pain_discussions_previous} the week before)` : ''}. ${t.rising} rising, ${t.new} newly observed, ${t.declining} easing.`;

  return (
    <div className="space-y-6">
      {/* Briefing header */}
      <section className="grid gap-8 pb-4 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p className="eyebrow">Friday brief for {fmtPeriod(report.period_start, report.period_end)}{report.version > 1 ? `, version ${report.version}` : ''}</p>
          <h1 className="mt-3 max-w-[26ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[38px]">{s?.headline ?? summary}</h1>
          <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">{s ? summary : 'The AI summary is unavailable for this report; every figure on this page is computed directly from the collected discussions.'}</p>
          {s?.findings[0] && (
            <div className="mt-5 max-w-[62ch] border-l-2 border-violet-line pl-4">
              <AiMark />
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2"><span className="font-medium text-ink">{s.findings[0].title}.</span> {s.findings[0].insight}</p>
              <FeedbackButtons reportId={report.id} itemType="finding" itemIndex={0} {...votes('finding', 0)} label={s.findings[0].title} />
            </div>
          )}
          <p className="meta mt-5">Generated {fmtDateTime(report.generated_at)} IST by {report.trigger === 'manual' ? 'a manual run' : 'the Friday schedule'}. Numbers are computed by code; AI text is marked.</p>
          <div className="mt-4"><ExportButtons markdown={markdown} /></div>
          {s && <div className="mt-3"><VoterBar voter={voter} team={team} /></div>}
        </div>
        <div className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-panel border border-line bg-panel p-6">
            <Metric value={t.discussions_analyzed} label="Unique discussions analysed" sub={`${t.keyword_mentions} keyword mentions`} />
            <Metric value={recurring.length} label="Recurring pain points" sub="seen before this week" />
            <Metric value={t.new} label="Newly observed" sub="no discussions last week" accent={t.new ? '#A06A08' : undefined} />
            <Metric value={sourcesEnabled} label="Sources monitored" sub={sources.filter((x) => x.is_enabled).map((x) => x.name).join(', ')} />
            <div className="col-span-2">
              <div className="mb-2 flex items-baseline justify-between"><p className="text-[13px] font-medium text-ink-2">Analysis coverage</p><p className="meta">{dq.analysis_coverage === null ? 'no discussions' : `${Math.round(dq.analysis_coverage * 100)}% of collected`}</p></div>
              <SegmentBar height="h-7" segments={[
                { label: 'Analysed', value: t.discussions_analyzed, className: 'bg-coal text-coal-text' },
                { label: 'Waiting for analysis', value: Math.max(0, t.discussions_collected - t.discussions_analyzed), className: 'bg-sunk text-ink-muted', hatch: true },
                { label: 'Duplicates excluded', value: t.duplicates_excluded, className: 'border border-line text-ink-muted' },
              ]} />
              <p className="meta mt-2">{t.discussions_collected} collected · {t.duplicates_excluded} duplicates excluded</p>
            </div>
          </div>
        </div>
      </section>

      {/* Lead signal + ranking */}
      <section className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          {lead ? <LeadSignal m={lead} history={sparks[lead.pain_point_key] ?? []} labels={sparkLabels} topicName={lead.topic_slug ? topicNames[lead.topic_slug] ?? null : null} periodStart={report.period_start} compare={compare} />
            : <div className="h-full rounded-panel bg-coal p-7 text-coal-muted">No pain discussions this week.</div>}
        </div>
        <div className="lg:col-span-7">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="h-panel">What developers struggled with</h2><Link href="/pain-points" className="link inline-flex items-center gap-1 text-[13px]">All pain points<ArrowRight size={13} aria-hidden="true" /></Link></div>
          {metrics.length ? <PainTable metrics={metrics} sparks={sparks} sparkLabels={sparkLabels} topics={topicNames} periodStart={report.period_start} compare={compare} variant="compact" limit={6} />
            : <Empty title="No pain points yet">Discussions were collected but none described a workflow pain this week.</Empty>}
        </div>
      </section>

      {/* Analytics row */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="panel panel-pad lg:col-span-5">
          <h2 className="h-panel">Discussion volume</h2><p className="meta mt-0.5">Unique discussions per week, last 8 weeks</p>
          <div className="mt-5"><VolumeChart data={volume} /></div>
        </div>
        <div className="panel panel-pad lg:col-span-4">
          <h2 className="h-panel">Where pain is surfacing</h2><p className="meta mt-0.5">Pain discussions by source this week</p>
          <div className="mt-5"><SegmentBar segments={bySource.filter((b) => b.cur_pain > 0).map((b, i) => ({ label: SOURCE_LABEL[b.id], value: b.cur_pain, className: ['bg-coal text-coal-text', 'bg-teal text-ink', 'bg-sunk text-ink-2'][i] ?? 'bg-sunk' }))} /></div>
          <ul className="mt-5 divide-y divide-line">
            {bySource.filter((b) => b.is_enabled || b.cur_collected).map((b) => {
              const tr = computeTrend(b.cur_pain, b.prev_pain);
              return (
                <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <SourceChip id={b.id} /><span className="flex-1 truncate">{b.name}</span>
                  <span className="tabular-nums"><span className="font-semibold">{b.cur_pain}</span>{compare && <span className="text-ink-faint"> / {b.prev_pain}</span>}</span>
                  {compare && <TrendTag trend={tr.trend} pct={tr.pctChange} size="sm" />}
                </li>
              );
            })}
          </ul>
          <Link href="/sources" className="link mt-3 inline-block text-[13px]">Source details</Link>
        </div>
        <div className="panel panel-pad lg:col-span-3">
          <h2 className="h-panel">Topic movement</h2><p className="meta mt-0.5">Pain discussions per topic</p>
          <ul className="mt-4 space-y-3.5">
            {topicMoves.map((tm) => (
              <li key={tm.slug}>
                <div className="flex items-start justify-between gap-2 text-sm"><span className="leading-snug">{tm.name}</span>{compare ? <TrendTag trend={tm.trend.trend} pct={tm.trend.pctChange} size="sm" /> : null}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="relative h-1.5 flex-1 rounded-full bg-sunk" aria-hidden="true"><span className="absolute inset-y-0 left-0 rounded-full bg-coal" style={{ width: `${(tm.trend.current / tm.max) * 100}%` }} /></span>
                  <span className="w-12 text-right text-xs tabular-nums text-ink-muted">{tm.trend.current}{compare ? ` / ${tm.trend.previous}` : ''}</span>
                </div>
              </li>
            ))}
            {!topicMoves.length && <li className="text-sm text-ink-muted">No categorised pain this week.</li>}
          </ul>
        </div>
      </section>

      {/* Opportunities + investigate */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="panel panel-pad lg:col-span-7">
          <div className="flex items-baseline justify-between gap-3"><h2 className="h-panel">Underserved problems</h2><Link href="/opportunities" className="link text-[13px]">All opportunities</Link></div>
          <p className="meta mt-0.5">Flagged by code: 2+ discussions this week and at least half unresolved. One complaint is never enough.</p>
          {underserved.length ? (
            <ul className="mt-5 divide-y divide-line">
              {underserved.map((m) => {
                const whyIndex = s?.underserved.findIndex((u) => u.pain_point_key === m.pain_point_key) ?? -1;
                const why = whyIndex >= 0 ? s!.underserved[whyIndex] : undefined;
                return (
                  <li key={m.pain_point_key} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{m.label}</p><span className="meta">{m.unresolved_count} of {m.current_count} unresolved, {m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}</span></div>
                    {why && <p className="mt-1.5 text-sm leading-relaxed text-ink-2"><AiMark label="AI" /> <span className="ml-1">{why.why}</span></p>}
                    <EvidenceLinks ids={why?.evidence_ids ?? m.evidence.slice(0, 2).map((e) => e.discussion_id)} map={evidence} />
                    {why && <FeedbackButtons reportId={report.id} itemType="underserved" itemIndex={whyIndex} {...votes('underserved', whyIndex)} label={`Why ${m.label} is underserved`} />}
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-5 text-sm text-ink-muted">No pain point met the underserved rule this week.</p>}
        </div>
        <div className="rounded-panel border border-violet-line bg-violet-soft/50 p-5 md:p-6 lg:col-span-5">
          <div className="flex items-center gap-2"><h2 className="h-panel">Worth investigating before Monday</h2><AiMark label="AI" /></div>
          <p className="meta mt-0.5">Suggestions to explore, not decisions. Each cites the discussions behind it.</p>
          {s?.investigate.length ? (
            <ol className="mt-5 space-y-5">
              {s.investigate.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet text-[12px] font-semibold text-white">{i + 1}</span>
                  <div className="min-w-0"><p className="font-medium leading-snug">{r.recommendation}</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{r.rationale}</p>
                    {r.pain_point_keys.length > 0 && <p className="meta mt-1">Related: {r.pain_point_keys.map((k) => label.get(k) ?? k).join(', ')}</p>}
                    <EvidenceLinks ids={r.evidence_ids} map={evidence} />
                    <FeedbackButtons reportId={report.id} itemType="recommendation" itemIndex={i} {...votes('recommendation', i)} label={r.recommendation} /></div>
                </li>
              ))}
            </ol>
          ) : <p className="mt-5 text-sm text-ink-muted">No AI suggestions for this report.</p>}
        </div>
      </section>

      <DataQualityStrip dq={dq} dropped={s?.dropped_unsupported ?? 0} caveats={s?.caveats ?? []} />
    </div>
  );
}

function topicMovement(metrics: TopicMetricRow[], names: Record<string, string>) {
  const acc = new Map<string, { c: number; p: number }>();
  for (const m of metrics) { if (!m.topic_slug) continue; const a = acc.get(m.topic_slug) ?? { c: 0, p: 0 }; a.c += m.current_count; a.p += m.previous_count; acc.set(m.topic_slug, a); }
  const rows = [...acc].map(([slug, v]) => ({ slug, name: names[slug] ?? slug, trend: computeTrend(v.c, v.p) })).filter((r) => r.trend.trend !== 'none').sort((a, b) => b.trend.current - a.trend.current);
  const max = Math.max(1, ...rows.map((r) => r.trend.current));
  return rows.map((r) => ({ ...r, max }));
}

function EvidenceLinks({ ids, map }: { ids: string[]; map: Map<string, EvidenceItem> }) {
  const items = ids.map((id) => map.get(id)).filter(Boolean) as EvidenceItem[];
  if (!items.length) return null;
  return (
    <ul className="mt-2.5 space-y-1">
      {items.slice(0, 3).map((e) => (
        <li key={e.discussion_id} className="flex items-center gap-2 text-[13px]">
          <SourceChip id={e.source_id as SourceId} />
          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="relative truncate text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-violet-ink">{e.title}<span className="sr-only"> (opens in new tab)</span></a>
        </li>
      ))}
    </ul>
  );
}

function DataQualityStrip({ dq, dropped, caveats }: { dq: DataQuality; dropped: number; caveats: string[] }) {
  const notes: { warn: boolean; text: string }[] = [];
  if (!dq.has_previous_report) notes.push({ warn: false, text: 'First report in this chain: last week comes from backfilled history, not a stored snapshot.' });
  if (dq.unanalyzed_in_window) notes.push({ warn: true, text: `${dq.unanalyzed_in_window} collected discussions not analysed yet and excluded from counts.` });
  for (const [src, h] of Object.entries(dq.source_health ?? {})) if (h.failed_requests) notes.push({ warn: true, text: `${SOURCE_LABEL[src as SourceId] ?? src}: ${h.failed_requests} of ${h.requests} requests failed; its trends may be understated.` });
  if (dq.keywords_added_since_last_report?.length) notes.push({ warn: true, text: `Keywords added since last report (${dq.keywords_added_since_last_report.map((k) => k.split(':')[1]).join(', ')}). Part of any rise may reflect wider monitoring.` });
  if (dq.keywords_removed_since_last_report?.length) notes.push({ warn: true, text: `Keywords removed: ${dq.keywords_removed_since_last_report.map((k) => k.split(':')[1]).join(', ')}.` });
  if (dq.previous_week_revised) notes.push({ warn: false, text: `Previous week revised from ${dq.previous_week_revised.was} to ${dq.previous_week_revised.now} pain discussions by late-arriving data.` });
  if (dq.insufficient_points) notes.push({ warn: false, text: `${plural(dq.insufficient_points, 'pain point')} rest on fewer than 3 discussions across both weeks.` });
  if (dropped) notes.push({ warn: false, text: `${plural(dropped, 'AI statement')} removed for citing no supplied evidence.` });
  return (
    <section aria-labelledby="dq-h" className="rounded-panel border border-line bg-sunk/60 px-5 py-4 md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dq-h" className="text-[13px] font-semibold">Data quality</h2>
        <Link href="/health" className="link text-[12px]">System health</Link>
      </div>
      <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-[13px] md:grid-cols-2">
        {notes.map((n, i) => <li key={i} className={`flex gap-2 ${n.warn ? 'text-rise' : 'text-ink-2'}`}><span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${n.warn ? 'bg-rise' : 'bg-ink-faint'}`} aria-hidden="true" />{n.text}</li>)}
        {caveats.map((c, i) => <li key={`c${i}`} className="flex gap-2 text-ink-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" /><span><span className="sr-only">AI caveat: </span>{c}</span></li>)}
        {!notes.length && !caveats.length && <li className="text-ink-muted">No coverage issues detected for this week.</li>}
      </ul>
    </section>
  );
}
