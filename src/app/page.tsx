import Link from 'next/link';
import { PulseLadder } from '@/components/PulseLadder';
import { RunButton } from '@/components/RunButton';
import { SetupNotice } from '@/components/SetupNotice';
import { missingEnv } from '@/lib/env';
import { fmtDateTime, fmtPeriod } from '@/lib/format';
import { getMetrics, getReport, listTopics, type DataQuality } from '@/lib/queries';
import { SOURCE_LABEL, type EvidenceItem, type SourceId, type TopicMetricRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const { report: reportId } = await searchParams;
  const safeId = reportId && /^[0-9a-f-]{36}$/i.test(reportId) ? reportId : undefined;
  const [report, { topics }] = await Promise.all([getReport(safeId), listTopics()]);

  if (!report) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold">No brief yet</h1>
        <p className="mt-2 text-muted">Collect discussions from Hacker News and Stack Overflow for your monitored keywords, analyze them with Gemini Flash, and build the first brief. The first collection looks back 15 days so this week can be compared with last week.</p>
        <div className="mt-5"><RunButton mode="full" primary /></div>
        <p className="mt-4 text-sm text-muted">If analysis is still queued after the run, run it again. Check progress in <Link href="/runs">Collection status</Link>.</p>
      </div>
    );
  }

  const metrics = await getMetrics(report.id);
  const t = report.totals;
  const s = report.synthesis;
  const evidenceById = new Map<string, EvidenceItem>(metrics.flatMap((m) => m.evidence.map((e) => [e.discussion_id, e] as const)));
  const labelByKey = new Map(metrics.map((m) => [m.pain_point_key, m.label]));
  const periodLabel = fmtPeriod(report.period_start, report.period_end);
  const deterministicHeadline = `${t.pain_discussions} discussions described a workflow pain or unmet need across ${t.pain_points_tracked} pain points; ${t.rising} rising and ${t.new} newly observed.`;
  const underservedMetrics = metrics.filter((m) => m.underserved);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <p className="text-sm text-muted">Friday brief for {periodLabel}{report.version > 1 ? ` (version ${report.version})` : ''}</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.2] tracking-[-0.01em] md:text-[34px]">{s?.headline ?? deterministicHeadline}</h1>
          <p className="mt-3 text-xs text-muted">
            Generated {fmtDateTime(report.generated_at)} IST by {report.trigger === 'manual' ? 'manual run' : 'Friday schedule'} · {s ? `AI summary by ${report.model}, numbers by code` : 'AI summary unavailable, numbers by code'} · analysis {report.analysis_version}
          </p>
        </div>
        <div className="flex flex-col gap-2"><RunButton mode="full" primary /><RunButton mode="report" /></div>
      </header>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Figure value={t.discussions_analyzed} label="Discussions analyzed" sub={`of ${t.discussions_collected} collected`} />
        <Figure value={t.relevant_discussions} label="Relevant to your space" />
        <Figure value={t.pain_discussions} label="Pain discussions" sub={`${t.pain_discussions_previous} previous week`} />
        <Figure value={t.keyword_mentions} label="Keyword mentions" sub="not unique discussions" />
        <Figure value={t.rising} label="Rising" color="#C2410C" />
        <Figure value={t.new} label="Newly observed" color="#5B47B0" />
      </section>

      <PulseLadder metrics={metrics} topics={topics.map((x) => ({ slug: x.slug, name: x.name }))} periodLabel={periodLabel} />

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="findings-h">
          <h2 id="findings-h" className="h-section">What stands out</h2>
          <p className="mt-0.5 text-xs text-muted">AI interpretation. Each point links to the discussions it is based on; uncited claims are removed.</p>
          {s?.findings.length ? (
            <ul className="mt-4 space-y-5">
              {s.findings.map((f, i) => (
                <li key={i}>
                  <p className="font-medium">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink/85">{f.insight}</p>
                  <EvidenceLinks ids={f.evidence_ids} map={evidenceById} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-muted">No AI findings for this report. The counts above are complete without it.</p>}
        </section>

        <section aria-labelledby="underserved-h">
          <h2 id="underserved-h" className="h-section">Potentially underserved problems</h2>
          <p className="mt-0.5 text-xs text-muted">Flagged by code when a pain point recurs (2+ discussions) and at least half remain unresolved.</p>
          {underservedMetrics.length ? (
            <ul className="mt-4 space-y-5">
              {underservedMetrics.map((m) => {
                const why = s?.underserved.find((u) => u.pain_point_key === m.pain_point_key);
                return (
                  <li key={m.pain_point_key}>
                    <p className="font-medium">{m.label}</p>
                    <p className="mt-0.5 text-xs text-muted">{m.unresolved_count} of {m.current_count} unresolved this week · {m.distinct_sources} source{m.distinct_sources === 1 ? '' : 's'}</p>
                    {why && <p className="mt-1 text-sm leading-relaxed text-ink/85">{why.why}</p>}
                    <EvidenceLinks ids={why?.evidence_ids ?? m.evidence.slice(0, 3).map((e) => e.discussion_id)} map={evidenceById} />
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 text-sm text-muted">No pain point met the underserved rule this week.</p>}
        </section>
      </div>

      {s?.investigate.length ? (
        <section aria-labelledby="inv-h">
          <h2 id="inv-h" className="h-section">Worth investigating before sprint planning</h2>
          <p className="mt-0.5 text-xs text-muted">Suggestions to explore, not decisions. Prioritization stays with you.</p>
          <ul className="mt-4 grid gap-5 md:grid-cols-2">
            {s.investigate.map((r, i) => (
              <li key={i} className="border-l-2 border-steel pl-4">
                <p className="font-medium">{r.recommendation}</p>
                <p className="mt-1 text-sm text-ink/85">{r.rationale}</p>
                {r.pain_point_keys.length > 0 && <p className="mt-1 text-xs text-muted">Related: {r.pain_point_keys.map((k) => labelByKey.get(k) ?? k).join(', ')}</p>}
                <EvidenceLinks ids={r.evidence_ids} map={evidenceById} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DataQualityPanel dq={report.data_quality} metrics={metrics} caveats={s?.caveats ?? []} dropped={s?.dropped_unsupported ?? 0} />
    </div>
  );
}

function Figure({ value, label, sub, color }: { value: number; label: string; sub?: string; color?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold" style={color ? { color } : undefined}>{value ?? 0}</p>
      <p className="text-sm">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function EvidenceLinks({ ids, map }: { ids: string[]; map: Map<string, EvidenceItem> }) {
  const items = ids.map((id) => map.get(id)).filter(Boolean) as EvidenceItem[];
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.slice(0, 4).map((e) => (
        <li key={e.discussion_id} className="text-xs">
          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.title}</a>
          <span className="text-muted"> · {SOURCE_LABEL[e.source_id]}</span>
        </li>
      ))}
    </ul>
  );
}

function DataQualityPanel({ dq, metrics, caveats, dropped }: { dq: DataQuality; metrics: TopicMetricRow[]; caveats: string[]; dropped: number }) {
  const notes: { tone: 'warn' | 'info'; text: string }[] = [];
  if (!dq.has_previous_report) notes.push({ tone: 'info', text: 'First stored report for this period chain; previous-week counts come from backfilled history, not an earlier snapshot.' });
  if (dq.unanalyzed_in_window > 0) notes.push({ tone: 'warn', text: `${dq.unanalyzed_in_window} collected discussions in the comparison window are not analyzed yet and are excluded from counts.` });
  if (dq.analysis_coverage !== null && dq.analysis_coverage < 0.9) notes.push({ tone: 'warn', text: `Analysis coverage this week is ${Math.round(dq.analysis_coverage * 100)}%.` });
  for (const [src, h] of Object.entries(dq.source_health ?? {})) if (h.failed_requests > 0) notes.push({ tone: 'warn', text: `${SOURCE_LABEL[src as SourceId] ?? src}: ${h.failed_requests} of ${h.requests} requests failed during the window; trends from this source may be understated.` });
  if (dq.keywords_added_since_last_report?.length) notes.push({ tone: 'warn', text: `Keywords added since the last report: ${dq.keywords_added_since_last_report.join(', ')}. New keywords are backfilled 15 days, but part of any rise may reflect broader monitoring.` });
  if (dq.keywords_removed_since_last_report?.length) notes.push({ tone: 'warn', text: `Keywords removed since the last report: ${dq.keywords_removed_since_last_report.join(', ')}.` });
  if (dq.previous_week_revised) notes.push({ tone: 'info', text: `Previous-week pain discussions revised from ${dq.previous_week_revised.was} to ${dq.previous_week_revised.now} because of late-arriving or newly analyzed data. Stored snapshots are unchanged.` });
  if (dq.insufficient_points) notes.push({ tone: 'info', text: `${dq.insufficient_points} pain point(s) have fewer than 3 discussions across both weeks; treat their trends as anecdotes.` });
  if (dropped) notes.push({ tone: 'info', text: `${dropped} AI statement(s) were removed because they did not cite supplied evidence.` });
  const verified = metrics.filter((m) => m.current_count > 0);
  const vShare = verified.length ? verified.reduce((a, m) => a + (m.verified_share ?? 0) * m.current_count, 0) / verified.reduce((a, m) => a + m.current_count, 0) : null;

  return (
    <section aria-labelledby="dq-h" className="rounded-lg border border-line bg-panel p-5">
      <h2 id="dq-h" className="h-section">Data quality and confidence</h2>
      <p className="mt-1 text-sm text-muted">{dq.collection_runs_in_window} collection runs over the two weeks · {vShare === null ? 'no evidence this week' : `${Math.round(vShare * 100)}% of current pain discussions have a verbatim-verified quote`}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {notes.map((n, i) => <li key={i} className={n.tone === 'warn' ? 'text-signal' : 'text-ink/85'}>{n.text}</li>)}
        {caveats.map((c, i) => <li key={`c${i}`} className="text-ink/85">AI caveat: {c}</li>)}
        {!notes.length && !caveats.length && <li className="text-muted">No coverage issues detected.</li>}
      </ul>
    </section>
  );
}
