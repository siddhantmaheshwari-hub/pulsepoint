import Link from 'next/link';
import { Activity, ArrowRight, MessagesSquare, Repeat, Sparkle } from 'lucide-react';
import { LeadSignal } from '@/components/pain/LeadSignal';
import { PainTable } from '@/components/pain/PainTable';
import { ExportButtons } from '@/components/shell/ExportButtons';
import { GenerateButton } from '@/components/shell/GenerateButton';
import { AiMark, Empty, KpiTile, PanelHead, SourceChip } from '@/components/ui/bits';
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
// The root page shares the layout's segment, so the layout's title template doesn't apply here.
export const metadata = { title: 'Friday brief · PulsePoint' };

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
  const sourceMax = Math.max(1, ...sourceRows.map((b) => Math.max(b.cur_pain, compare ? b.prev_pain : 0)));

  return (
    <div className="space-y-6 lg:space-y-7">
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

      {/* The week in four numbers (all computed by code) */}
      <section aria-label="This week in numbers" className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <KpiTile icon={<Activity size={15} aria-hidden="true" />} tone="coal" label="Pain discussions" value={t.pain_discussions}
          sub={compare ? <span className="inline-flex flex-wrap items-center gap-1.5">{t.pain_discussions_previous} last week <TrendTag trend={painTrend.trend} pct={painTrend.pctChange} size="sm" /></span> : 'this week'} />
        <KpiTile icon={<Sparkle size={15} aria-hidden="true" />} tone="fresh" label="Newly observed" value={t.new} sub="no discussions last week" accent={t.new ? '#9A6608' : undefined} />
        <KpiTile icon={<Repeat size={15} aria-hidden="true" />} tone="mist" label="Recurring pain points" value={recurring.length} sub="seen before this week" />
        <KpiTile icon={<MessagesSquare size={15} aria-hidden="true" />} tone="sand" label="Discussions analysed" value={t.discussions_analyzed} sub={`${t.keyword_mentions} keyword mentions`} />
      </section>

      {/* Lead signal + ranking */}
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          {lead ? <LeadSignal m={lead} history={sparks[lead.pain_point_key] ?? []} labels={sparkLabels} topicName={lead.topic_slug ? topicNames[lead.topic_slug] ?? null : null} periodStart={report.period_start} compare={compare} />
            : <div className="h-full rounded-panel bg-coal p-7 text-coal-muted">No pain discussions this week.</div>}
        </div>
        <div className="flex flex-col xl:col-span-7">
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <div><h2 className="h-panel">What developers struggled with</h2><p className="sub">Ranked by unique discussions this week · select a row for evidence</p></div>
            <Link href="/pain-points" className="link inline-flex shrink-0 items-center gap-1 text-[13px]">All pain points<ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
          {metrics.length ? <PainTable metrics={metrics} sparks={sparks} sparkLabels={sparkLabels} topics={topicNames} periodStart={report.period_start} compare={compare} variant="compact" limit={6} />
            : <Empty title="No pain points yet">Discussions were collected but none described a workflow pain this week.</Empty>}
        </div>
      </section>

      {/* Analytics row */}
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-12">
        <div className="panel panel-pad flex flex-col md:col-span-2 xl:col-span-5">
          <PanelHead title="Discussion volume" sub="Unique discussions per week, last 8 weeks" />
          <div className="well-mist mt-5 flex-1 px-4 pb-4 pt-5"><VolumeChart data={volume} /></div>
        </div>
        <div className="panel panel-pad flex flex-col xl:col-span-4">
          <PanelHead title="Where pain is surfacing" sub="Pain discussions by source this week" action={<Link href="/sources" className="link text-[13px]">Sources</Link>} />
          <ul className="mt-5 flex flex-1 flex-col justify-center gap-5">
            {sourceRows.map((b) => {
              const tr = computeTrend(b.cur_pain, b.prev_pain);
              return (
                <li key={b.id}>
                  <div className="flex items-center gap-2.5 text-sm">
                    <SourceChip id={b.id} /><span className="flex-1 truncate font-medium text-ink-2">{b.name}</span>
                    <span className="tabular-nums"><span className="font-semibold">{b.cur_pain}</span>{compare && <span className="text-ink-faint"> / {b.prev_pain}</span>}</span>
                    {compare && <TrendTag trend={tr.trend} pct={tr.pctChange} size="sm" />}
                  </div>
                  <div className="relative mt-2 h-2 rounded-full bg-sunk" role="img" aria-label={`${b.name}: ${b.cur_pain} pain discussions this week${compare ? `, ${b.prev_pain} the week before` : ''}`}>
                    {compare && <span className="absolute inset-y-0 left-0 rounded-full border border-ink-faint/40" style={{ width: `${(b.prev_pain / sourceMax) * 100}%` }} />}
                    <span className="absolute inset-y-0 left-0 rounded-full bg-coal" style={{ width: `${(b.cur_pain / sourceMax) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="meta mt-4">{compare ? 'Solid bar: this week · outline: the week before.' : 'Bar length: pain discussions this week.'} {sourceRows.filter((b) => b.cur_collected).length} of {sourceRows.length} sources returned discussions.</p>
        </div>
        <div className="panel panel-pad xl:col-span-3">
          <PanelHead title="Topic movement" sub="Pain discussions per topic" />
          <ul className="mt-5 space-y-4">
            {topicMoves.map((tm) => (
              <li key={tm.slug}>
                <div className="flex items-start justify-between gap-2 text-sm"><span className="font-medium leading-snug text-ink-2">{tm.name}</span>{compare ? <TrendTag trend={tm.trend.trend} pct={tm.trend.pctChange} size="sm" /> : null}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="relative h-2 flex-1 rounded-full bg-sunk" aria-hidden="true"><span className="absolute inset-y-0 left-0 rounded-full bg-teal-ink" style={{ width: `${(tm.trend.current / tm.max) * 100}%` }} /></span>
                  <span className="w-11 text-right text-xs tabular-nums text-ink-muted">{tm.trend.current}{compare ? ` / ${tm.trend.previous}` : ''}</span>
                </div>
              </li>
            ))}
            {!topicMoves.length && <li className="text-sm text-ink-muted">No categorised pain this week.</li>}
          </ul>
        </div>
      </section>

      {/* Opportunities + investigate: each card hugs its content (no stretched empty space) */}
      <section className="grid items-start gap-6 xl:grid-cols-12 xl:grid-rows-[auto_1fr]">
        <div className="panel panel-pad xl:col-span-7 xl:row-start-1">
          <PanelHead title="Underserved problems" sub="Flagged by code: 2+ discussions this week and at least half unresolved. One complaint is never enough." action={<Link href="/opportunities" className="link text-[13px]">All opportunities</Link>} />
          {underserved.length ? (
            <ul className="mt-5 space-y-3">
              {underserved.map((m) => {
                const whyIndex = s?.underserved.findIndex((u) => u.pain_point_key === m.pain_point_key) ?? -1;
                const why = whyIndex >= 0 ? s!.underserved[whyIndex] : undefined;
                return (
                  <li key={m.pain_point_key} className="well px-4 py-4">
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
        <div className="relative overflow-hidden rounded-panel border border-violet-line/80 bg-gradient-to-b from-violet-soft via-[#F6F4FE] to-panel p-5 shadow-card md:p-6 xl:col-span-5 xl:col-start-8 xl:row-span-2 xl:row-start-1">
          <div className="flex items-center gap-2"><h2 className="h-panel">Worth investigating before Monday</h2><AiMark label="AI" /></div>
          <p className="meta mt-0.5">Suggestions to explore, not decisions. Each cites the discussions behind it.</p>
          {s?.investigate.length ? (
            <ol className="mt-5 space-y-5">
              {s.investigate.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet text-[12px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(91,79,224,.8)]">{i + 1}</span>
                  <div className="min-w-0"><p className="font-medium leading-snug">{r.recommendation}</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{r.rationale}</p>
                    {r.pain_point_keys.length > 0 && <p className="meta mt-1">Related: {r.pain_point_keys.map((k) => label.get(k) ?? k).join(', ')}</p>}
                    <EvidenceLinks ids={r.evidence_ids} map={evidence} />
                    <FeedbackButtons reportId={report.id} itemType="recommendation" itemIndex={i} {...votes('recommendation', i)} label={r.recommendation} /></div>
                </li>
              ))}
            </ol>
          ) : <p className="mt-5 text-sm text-ink-muted">No AI suggestions for this report.</p>}
        </div>
        <DataQualityStrip dq={dq} dropped={s?.dropped_unsupported ?? 0} caveats={s?.caveats ?? []} />
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
    <section aria-labelledby="dq-h" className="rounded-panel border border-line-soft bg-sunk/60 px-5 py-5 md:px-6 xl:col-span-7 xl:row-start-2">
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
