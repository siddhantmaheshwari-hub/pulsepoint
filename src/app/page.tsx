import Link from 'next/link';
import { Activity, ArrowRight, MessagesSquare, Repeat, Sparkle } from 'lucide-react';
import { LeadSignal } from '@/components/pain/LeadSignal';
import { PainBars } from '@/components/pain/PainBars';
import { ExportButtons } from '@/components/shell/ExportButtons';
import { GenerateButton } from '@/components/shell/GenerateButton';
import { AiMark, Dashes, Empty, KpiTile, Meter, SectionHead, SourceChip } from '@/components/ui/bits';
import { FeedbackButtons, VoterBar } from '@/components/ui/FeedbackButtons';
import { TrendTag } from '@/components/ui/Trend';
import { PeriodView } from '@/components/PeriodView';
import { SetupNotice } from '@/components/SetupNotice';
import { Ring } from '@/components/viz/Ring';
import { SegmentBar } from '@/components/viz/SegmentBar';
import { Sparkline } from '@/components/viz/Sparkline';
import { VolumeChart } from '@/components/viz/VolumeChart';
import { loadBrief } from '@/lib/brief';
import { env, missingEnv } from '@/lib/env';
import { briefMarkdown } from '@/lib/export';
import { fmtDateTime, fmtPeriod, plural } from '@/lib/format';
import { weekHighlights } from '@/lib/highlights';
import { compareOn, type SP } from '@/lib/params';
import { parsePeriod } from '@/lib/periods';
import { getFeedback, getSourceBreakdown, getWeeklyVolume, type DataQuality } from '@/lib/queries';
import { computeTrend } from '@/lib/trends';
import { getVoting } from '@/lib/voter';
import { SOURCE_LABEL, type EvidenceItem, type SourceId, type TopicMetricRow } from '@/lib/types';
// The root page shares the layout's segment, so the layout's title template doesn't apply here.
export const metadata = { title: 'Friday brief · PulsePoint' };

// Topic rings and platform colours: restrained, distinguishable, never the only signal (always labelled).
const TOPIC_COLORS = ['#15171C', '#C4472A', '#3F6B67', '#5B4FE0', '#E3B33E', '#8E939B'];
const SRC_COLOR: Record<SourceId, string> = { hackernews: '#E2703A', stackoverflow: '#E3B33E', github: '#15171C' };

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

  const painTrend = computeTrend(t.pain_discussions, t.pain_discussions_previous);
  const coverage = dq.analysis_coverage === null ? null : Math.round(dq.analysis_coverage * 100);
  const sourceRows = bySource.filter((b) => b.is_enabled || b.cur_collected);

  const h = weekHighlights(metrics);
  // Weekly pain totals for the KPI sparkline: monitored weeks only (a gap is not a zero).
  const painSeries = volume.filter((v) => v.monitored).map((v) => v.pain);
  const topicTotal = topicMoves.reduce((a, tm) => a + tm.trend.current, 0);
  const srcPainTotal = sourceRows.reduce((a, b) => a + b.cur_pain, 0);

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Hero: the one sentence that matters, with the AI reading beside it */}
      <section className="grid gap-6 xl:grid-cols-12 xl:gap-10">
        <div className="flex flex-col xl:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag h-7 bg-coal px-3 text-coal-text">Friday brief</span>
            <span className="tag h-7 border border-line bg-panel px-3 text-ink-2">{fmtPeriod(report.period_start, report.period_end)}</span>
            {report.version > 1 && <span className="tag h-7 bg-sunk px-3 text-ink-muted">Version {report.version}</span>}
          </div>
          <h1 className="mt-5 max-w-[24ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.032em] md:text-[42px]">{s?.headline ?? summary}</h1>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">{s ? summary : 'The AI summary is unavailable for this report; every figure on this page is computed directly from the collected discussions.'}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 pt-6">
            <ExportButtons markdown={markdown} />
            {s && <VoterBar voter={voter} team={team} />}
          </div>
          <p className="meta mt-4">Generated {fmtDateTime(report.generated_at)} IST by {report.trigger === 'manual' ? 'a manual run' : 'the Friday schedule'}. Numbers are computed by code; AI text is marked.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:col-span-5 xl:flex xl:flex-col">
          {s?.findings[0] ? (
            <div className="ai-card flex-1 shadow-card">
              <div className="flex items-center justify-between gap-3"><AiMark /><span className="meta">Finding 1 of {s.findings.length}</span></div>
              <p className="mt-3 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{s.findings[0].title}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.findings[0].insight}</p>
              <FeedbackButtons reportId={report.id} itemType="finding" itemIndex={0} {...votes('finding', 0)} label={s.findings[0].title} />
            </div>
          ) : <div className="flex-1" />}
          <div className="panel px-5 py-4">
            <div className="mb-2.5 flex items-baseline justify-between gap-3"><p className="text-[13px] font-medium text-ink-2">Analysis coverage</p><p className="text-[13px] font-semibold tabular-nums">{coverage === null ? '—' : `${coverage}%`}</p></div>
            <SegmentBar height="h-2" showLabels={false} segments={[
              { label: 'Analysed', value: t.discussions_analyzed, className: 'bg-teal-ink' },
              { label: 'Waiting for analysis', value: Math.max(0, t.discussions_collected - t.discussions_analyzed), className: 'bg-sunk', hatch: true },
              { label: 'Duplicates excluded', value: t.duplicates_excluded, className: 'bg-line-strong' },
            ]} />
            <p className="meta mt-2.5">{t.discussions_collected} collected · {t.duplicates_excluded} duplicates excluded · {sourcesEnabled} sources: {sources.filter((x) => x.is_enabled).map((x) => x.name).join(', ')}</p>
          </div>
        </div>
      </section>

      {/* The week in four numbers (all computed by code), each with a small supporting visual */}
      <section aria-label="This week in numbers" className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile icon={<Activity size={15} aria-hidden="true" />} tone="coal" label="Pain discussions" value={t.pain_discussions} unit="this week"
          sub={compare ? <span className="inline-flex flex-wrap items-center gap-1.5">{t.pain_discussions_previous} last week <TrendTag trend={painTrend.trend} pct={painTrend.pctChange} size="sm" /></span> : undefined}
          viz={painSeries.length >= 2 ? <Sparkline values={painSeries} width={150} height={26} color="#15171C" label="Pain discussions per week" /> : undefined} />
        <KpiTile icon={<Sparkle size={15} aria-hidden="true" />} tone="fresh" label="Newly observed" value={t.new} unit={`of ${t.pain_points_tracked} pain points`} sub="no discussions last week" accent={t.new ? '#9A6608' : undefined}
          viz={<Dashes on={t.new} total={t.pain_points_tracked} color="#E3B33E" label="Newly observed pain points" />} />
        <KpiTile icon={<Repeat size={15} aria-hidden="true" />} tone="mist" label="Recurring pain points" value={recurring.length} unit={`of ${active.length}`} sub="seen before this week"
          viz={<Meter value={recurring.length} max={active.length} label="Recurring pain points" />} />
        <KpiTile icon={<MessagesSquare size={15} aria-hidden="true" />} tone="sand" label="Discussions read" value={t.discussions_analyzed} unit="unique" sub={`${t.keyword_mentions} keyword mentions · ${coverage ?? 0}% analysed`}
          viz={<Meter value={t.discussions_analyzed} max={Math.max(1, t.discussions_collected)} color="#383D46" label="Discussions analysed of collected" />} />
      </section>

      {/* 01 · This week in brief: four deterministic answers */}
      <section aria-labelledby="s-brief">
        <SectionHead n={1} id="s-brief" title="This week in brief" aside="Picked by code from this week’s counts" />
        <div className="panel overflow-hidden">
          <p className="px-5 pt-5 text-[16px] leading-relaxed text-ink md:px-7 md:pt-6 md:text-[17px]">
            <span className="font-semibold">{t.pain_discussions} of {t.discussions_analyzed}</span> discussions this week describe a real workflow pain.
            {h.biggest && <> The biggest is <span className="font-semibold">“{h.biggest.label}”</span>.</>}
            {h.growing && h.growing.key !== h.biggest?.key && <> <span className="font-semibold">“{h.growing.label}”</span> is growing fastest.</>}
          </p>
          <dl className="mt-5 grid border-t border-line-soft sm:grid-cols-2 xl:grid-cols-4">
            {([['Biggest', h.biggest, '#15171C'], ['Growing fastest', h.growing, '#C4472A'], ['Least solved', h.leastSolved, '#3F6B67'], ['New this week', h.fresh, '#E3B33E']] as const).map(([k, v, c], i) => (
              <div key={k} className={`px-5 py-4 md:px-7 md:py-5 ${i ? 'border-t border-line-soft sm:border-t-0' : ''} ${i % 2 ? 'sm:border-l' : ''} ${i >= 2 ? 'sm:border-t xl:border-t-0' : ''} ${i ? 'xl:border-l' : ''} border-line-soft`}>
                <dt className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} aria-hidden="true" />{k}</dt>
                <dd className="mt-2 text-[14.5px] font-semibold leading-snug text-ink">{v ? v.label : <span className="font-normal text-ink-muted">Nothing qualifies this week</span>}</dd>
                {v && <dd className="mt-1 text-[12.5px] tabular-nums text-ink-muted">{v.detail}</dd>}
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 02 · Most talked-about problems + 03 · Biggest change */}
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col xl:col-span-7" aria-labelledby="s-top">
          <SectionHead n={2} id="s-top" title="Most talked-about problems" aside={<Link href="/pain-points" className="link inline-flex items-center gap-1">All pain points<ArrowRight size={12} aria-hidden="true" /></Link>} />
          <div className="panel flex-1 px-4 py-3 md:px-6 md:py-4">
            {metrics.length ? <PainBars metrics={metrics} sparks={sparks} sparkLabels={sparkLabels} topics={topicNames} periodStart={report.period_start} compare={compare} limit={7} />
              : <Empty title="No pain points yet">Discussions were collected but none described a workflow pain this week.</Empty>}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft pt-3 text-[12px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rise-fill" aria-hidden="true" />Rising</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fresh-fill" aria-hidden="true" />New</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#8E939B]" aria-hidden="true" />Stable</span>
              {compare && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-ink/45" aria-hidden="true" />Last week</span>}
              <span>Select a problem to open its evidence.</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col xl:col-span-5" aria-labelledby="s-lead">
          <SectionHead n={3} id="s-lead" title="Biggest change" />
          <div className="flex-1">
            {lead ? <LeadSignal m={lead} history={sparks[lead.pain_point_key] ?? []} labels={sparkLabels} topicName={lead.topic_slug ? topicNames[lead.topic_slug] ?? null : null} periodStart={report.period_start} compare={compare} />
              : <div className="h-full rounded-panel bg-coal p-7 text-coal-muted">No pain discussions this week.</div>}
          </div>
        </div>
      </section>

      {/* 04 · Worth investigating (AI) beside 05 · Underserved and 06 · By topic */}
      <section className="grid items-start gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7" aria-labelledby="s-act">
          <SectionHead n={4} id="s-act" title="Worth investigating before Monday" aside="Suggestions, not decisions" />
          <div className="relative overflow-hidden rounded-panel border border-violet-line/80 bg-gradient-to-b from-violet-soft via-[#F6F4FE] to-panel p-5 shadow-card md:p-6">
            <div className="flex items-center justify-between gap-2"><AiMark /><span className="meta">Each suggestion cites the discussions behind it</span></div>
            {s?.investigate.length ? (
              <ol className="mt-4 divide-y divide-violet-line/50">
                {s.investigate.map((r, i) => (
                  <li key={i} className="flex gap-4 py-5 first:pt-2 last:pb-1">
                    <span className="font-mono text-[22px] font-light leading-none text-violet-ink">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0"><p className="text-[15.5px] font-semibold leading-snug">{r.recommendation}</p><p className="mt-1.5 text-sm leading-relaxed text-ink-2">{r.rationale}</p>
                      {r.pain_point_keys.length > 0 && <p className="meta mt-1.5">Related: {r.pain_point_keys.map((k) => label.get(k) ?? k).join(', ')}</p>}
                      <EvidenceLinks ids={r.evidence_ids} map={evidence} />
                      <FeedbackButtons reportId={report.id} itemType="recommendation" itemIndex={i} {...votes('recommendation', i)} label={r.recommendation} /></div>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-5 text-sm text-ink-muted">No AI suggestions for this report.</p>}
          </div>
        </div>
        <div className="space-y-6 xl:col-span-5">
          <div aria-labelledby="s-under">
            <SectionHead n={5} id="s-under" title="Underserved problems" aside={<Link href="/opportunities" className="link">All opportunities</Link>} />
            <div className="panel panel-pad">
              <p className="meta">Flagged by code: 2+ discussions this week and at least half unresolved. One complaint is never enough.</p>
              {underserved.length ? (
                <ul className="mt-4 space-y-3">
                  {underserved.map((m) => {
                    const whyIndex = s?.underserved.findIndex((u) => u.pain_point_key === m.pain_point_key) ?? -1;
                    const why = whyIndex >= 0 ? s!.underserved[whyIndex] : undefined;
                    return (
                      <li key={m.pain_point_key} className="well px-4 py-4">
                        <p className="font-semibold leading-snug">{m.label}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="flex-1"><Meter value={m.unresolved_count} max={m.current_count} color="#C4472A" label="Unresolved discussions" /></span>
                          <span className="shrink-0 text-[12px] tabular-nums text-ink-muted">{m.unresolved_count} of {m.current_count} unresolved · {m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}</span>
                        </div>
                        {why && <p className="mt-2.5 text-sm leading-relaxed text-ink-2"><AiMark label="AI" /> <span className="ml-1">{why.why}</span></p>}
                        <EvidenceLinks ids={why?.evidence_ids ?? m.evidence.slice(0, 2).map((e) => e.discussion_id)} map={evidence} />
                        {why && <FeedbackButtons reportId={report.id} itemType="underserved" itemIndex={whyIndex} {...votes('underserved', whyIndex)} label={`Why ${m.label} is underserved`} />}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-4 text-sm text-ink-muted">No pain point met the underserved rule this week.</p>}
            </div>
          </div>
          <div aria-labelledby="s-topic">
            <SectionHead n={6} id="s-topic" title="By topic" aside="Share of this week’s pain discussions" />
            <div className="panel panel-pad">
              {topicMoves.length ? (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6">
                  {topicMoves.map((tm, i) => {
                    const share = topicTotal ? Math.round((tm.trend.current / topicTotal) * 100) : 0;
                    return (
                      <li key={tm.slug} className="flex flex-col items-center text-center">
                        <Ring size={86} thickness={8} label={`${tm.name} share of pain discussions`} segments={[{ label: tm.name, value: tm.trend.current, color: TOPIC_COLORS[i % TOPIC_COLORS.length] }, { label: 'Other topics', value: Math.max(0, topicTotal - tm.trend.current), color: 'transparent' }]}
                          center={<span className="text-[17px] font-semibold tabular-nums">{share}<span className="text-[11px] font-medium text-ink-muted">%</span></span>} />
                        <p className="mt-2.5 text-[13px] font-medium leading-snug text-ink-2">{tm.name}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] tabular-nums text-ink-muted">{tm.trend.current}{compare ? ` / ${tm.trend.previous}` : ''} {compare && <TrendTag trend={tm.trend.trend} pct={tm.trend.pctChange} size="sm" />}</p>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-ink-muted">No categorised pain this week.</p>}
            </div>
          </div>
        </div>
      </section>

      {/* 07 · Volume + 08 · By platform */}
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col xl:col-span-7" aria-labelledby="s-vol">
          <SectionHead n={7} id="s-vol" title="Discussion volume" aside="Unique discussions per week, last 8 weeks" />
          <div className="panel panel-pad flex-1"><div className="well-mist h-full px-4 pb-4 pt-5"><VolumeChart data={volume} /></div></div>
        </div>
        <div className="flex flex-col xl:col-span-5" aria-labelledby="s-plat">
          <SectionHead n={8} id="s-plat" title="By platform" aside={<Link href="/sources" className="link">Sources</Link>} />
          <div className="panel panel-pad flex flex-1 flex-col gap-6 sm:flex-row sm:items-center">
            <Ring size={132} thickness={12} label="Pain discussions by platform this week" segments={sourceRows.map((b) => ({ label: b.name, value: b.cur_pain, color: SRC_COLOR[b.id] }))}
              center={<span><span className="block text-[30px] font-light leading-none tracking-[-0.04em]">{srcPainTotal}</span><span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-muted">pain</span></span>} />
            <ul className="flex-1 space-y-2.5 text-[13.5px]">
              {sourceRows.map((b) => {
                const tr = computeTrend(b.cur_pain, b.prev_pain);
                return (
                  <li key={b.id} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SRC_COLOR[b.id] }} aria-hidden="true" />
                    <span className="flex-1 truncate font-medium text-ink-2">{b.name}</span>
                    <span className="tabular-nums"><span className="font-semibold">{b.cur_pain}</span>{compare && <span className="text-ink-faint"> / {b.prev_pain}</span>}</span>
                    {compare && <TrendTag trend={tr.trend} pct={tr.pctChange} size="sm" />}
                  </li>
                );
              })}
              {(['Reddit', 'Discord', 'X'] as const).map((name) => (
                <li key={name} className="flex items-center gap-2.5 text-ink-muted">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-line-strong" aria-hidden="true" />
                  <span className="flex-1">{name}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em]">{name === 'Reddit' ? 'Pending approval' : 'Not connected'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 09 · How we counted: the numbers behind every claim, and what limits them */}
      <section aria-labelledby="s-count">
        <SectionHead n={9} id="s-count" title="How we counted" aside={<Link href="/health" className="link">System health</Link>} />
        <div className="panel overflow-hidden">
          <dl className="grid grid-cols-2 xl:grid-cols-4">
            {([
              ['Discussions read', t.discussions_analyzed, 'unique threads that mention a tracked keyword', '#383D46', 1],
              ['Describe a pain', t.pain_discussions, 'workflow pain or unmet need, labelled by Gemini Flash', '#C4472A', t.discussions_analyzed ? t.pain_discussions / t.discussions_analyzed : 0],
              ['Set aside', Math.max(0, t.discussions_analyzed - t.pain_discussions), 'how-to questions, opinions, one-off bugs, off-topic', '#8E939B', t.discussions_analyzed ? (t.discussions_analyzed - t.pain_discussions) / t.discussions_analyzed : 0],
              ['Platforms read', `${sourcesEnabled} / 6`, 'Reddit pending; Discord and X not connected', '#3F6B67', sourcesEnabled / 6],
            ] as const).map(([k, v, d, c, frac], i) => (
              <div key={k} className={`px-5 py-5 md:px-7 ${i % 2 ? 'border-l border-line-soft' : ''} ${i >= 2 ? 'border-t border-line-soft xl:border-t-0' : ''} ${i === 2 ? 'xl:border-l' : ''}`}>
                <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{k}</dt>
                <dd className="mt-2 text-[34px] font-light leading-none tracking-[-0.04em] tabular-nums">{v}</dd>
                <dd className="mt-3 h-1 rounded-full bg-ink/[.07]" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${Math.round(Number(frac) * 100)}%`, background: c }} /></dd>
                <dd className="mt-2 text-[12px] leading-snug text-ink-muted">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line-soft px-5 py-4 text-[12.5px] leading-relaxed text-ink-muted md:px-7">
            A discussion is one thread, counted once however many comments or keyword mentions it has; cross-posts are merged. Weeks run Friday to Thursday (IST) and are compared with the week before; months and ranges are compared with an equal-length period just before them. Trends need a change of at least 2 discussions and 25%. All counts come from code; Gemini only labels discussions and writes the text marked AI.
          </p>
          <DataQualityStrip dq={dq} dropped={s?.dropped_unsupported ?? 0} caveats={s?.caveats ?? []} />
        </div>
      </section>
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
    <section aria-labelledby="dq-h" className="border-t border-line-soft bg-sunk/50 px-5 py-5 md:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dq-h" className="text-[13px] font-semibold">Data quality</h2>
        <Link href="/health" className="link text-[12px]">System health</Link>
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-2 text-[13px] md:grid-cols-2">
        {notes.map((n, i) => <li key={i} className={`flex gap-2 ${n.warn ? 'text-rise' : 'text-ink-2'}`}><span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${n.warn ? 'bg-rise' : 'bg-ink-faint'}`} aria-hidden="true" />{n.text}</li>)}
        {caveats.map((c, i) => <li key={`c${i}`} className="flex gap-2 text-ink-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" /><span><span className="sr-only">AI caveat: </span>{c}</span></li>)}
        {!notes.length && !caveats.length && <li className="text-ink-muted">No coverage issues detected for this week.</li>}
      </ul>
    </section>
  );
}
