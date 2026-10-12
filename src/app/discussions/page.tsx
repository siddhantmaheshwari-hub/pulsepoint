import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { SetupNotice } from '@/components/SetupNotice';
import { AiMark, Empty, PageHeader, SourceChip } from '@/components/ui/bits';
import { env, missingEnv } from '@/lib/env';
import { fmtDate, fmtPeriod } from '@/lib/format';
import { one, type SP } from '@/lib/params';
import { parsePeriod, periodParams } from '@/lib/periods';
import { getMetrics, getReport, listDiscussions, listTopics, windowFor, type DiscussionRow } from '@/lib/queries';
import { SOURCE_LABEL, type SourceId } from '@/lib/types';

const KIND: Record<string, string> = { workflow_pain: 'Workflow pain', unmet_need: 'Unmet need', isolated_bug: 'Isolated bug', how_to_question: 'How-to question', opinion: 'Opinion', not_relevant: 'Not relevant' };
const RES: Record<string, string> = { unresolved: 'Unresolved', partially_resolved: 'Partly resolved', resolved: 'Resolved', unknown: 'Status unclear' };

export default async function DiscussionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const missing = missingEnv();
  if (missing.length) return <SetupNotice missing={missing} />;
  const sp = await searchParams;
  const report = await getReport(one(sp.report));
  // Month / Range from the top bar override the weekly window (same dates as the period view's counts).
  const period = parsePeriod(sp, new Date(), env.tzOffsetMinutes);
  const pw = 'w' in period ? period.w : null;
  const keepPeriod = periodParams(period);
  const unit = pw ? 'period' : 'week';
  const w = pw ? { start: pw.currentStart.toISOString(), end: pw.currentEnd.toISOString(), prevStart: pw.previousStart.toISOString() } : windowFor(report);
  const scope = one(sp.scope) === 'previous' ? 'previous' : one(sp.scope) === 'both' ? 'both' : 'current';
  const start = scope === 'current' ? w.start : w.prevStart, end = scope === 'previous' ? w.start : w.end;
  const q = (one(sp.q) ?? '').slice(0, 100), source = one(sp.source) ?? 'all', topic = one(sp.topic) ?? 'all', kind = one(sp.kind) ?? 'all', key = one(sp.key) ?? '';
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const safeKey = /^[a-z0-9-]{3,60}$/.test(key) ? key : '';
  const [{ rows, total, pageSize }, { topics }, metrics] = await Promise.all([
    listDiscussions({ q, source, topic, kind, key: safeKey, start, end, page }), listTopics(), report ? getMetrics(report.id) : Promise.resolve([]),
  ]);
  const topicNames = Object.fromEntries(topics.map((t) => [t.slug, t.name]));
  const ql = q.toLowerCase();
  const matchedPain = q ? metrics.filter((m) => m.label.toLowerCase().includes(ql)).slice(0, 5) : [];
  const matchedTopics = q ? topics.filter((t) => t.name.toLowerCase().includes(ql) || t.keywords.some((k) => k.term.toLowerCase().includes(ql))).slice(0, 5) : [];
  const keyLabel = safeKey ? metrics.find((m) => m.pain_point_key === safeKey)?.label ?? safeKey : null;
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keepPeriod, report: one(sp.report) ?? null, compare: one(sp.compare) ?? null, q: q || null, source: source === 'all' ? null : source, topic: topic === 'all' ? null : topic, kind: kind === 'all' ? null : kind, key: safeKey || null, scope: scope === 'current' ? null : scope, ...patch })) if (v) p.set(k, v);
    return `/discussions${p.toString() ? `?${p}` : ''}`;
  };

  return (
    <div>
      <PageHeader title="Discussions" lead={<>The original developer conversations behind every number, {scope === 'both' ? `across both ${unit}s` : scope === 'previous' ? `from the previous ${unit} (${fmtPeriod(start, end)})` : `for ${fmtPeriod(start, end)}`}. Source text is shown as written; the AI reading sits beside it.</>} />

      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <form method="get" action="/discussions" className="space-y-5 lg:sticky lg:top-6 lg:self-start" aria-label="Filter discussions">
          {one(sp.report) && <input type="hidden" name="report" value={one(sp.report)} />}
          {one(sp.compare) && <input type="hidden" name="compare" value={one(sp.compare)} />}
          {safeKey && <input type="hidden" name="key" value={safeKey} />}
          {Object.entries(keepPeriod).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <Field label="Search"><input name="q" defaultValue={q} className="field w-full" placeholder="Words in title or text" /></Field>
          <Field label={unit === 'week' ? 'Week' : 'Period'}><select name="scope" defaultValue={scope} className="field w-full"><option value="current">Selected {unit}</option><option value="previous">Previous {unit}</option><option value="both">Both {unit}s</option></select></Field>
          <Field label="Source"><select name="source" defaultValue={source} className="field w-full"><option value="all">All sources</option>{(Object.keys(SOURCE_LABEL) as SourceId[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></Field>
          <Field label="Topic"><select name="topic" defaultValue={topic} className="field w-full"><option value="all">All topics</option>{topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select></Field>
          <Field label="AI classification"><select name="kind" defaultValue={kind} className="field w-full"><option value="all">Everything</option><option value="pain">Pain points only</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="pending">Not analysed yet</option></select></Field>
          <div className="flex gap-2"><button className="pill-dark">Apply</button><Link href={href({ q: null, source: null, topic: null, kind: null, key: null, scope: null })} className="pill-quiet">Reset</Link></div>
        </form>

        <div className="min-w-0">
          {(matchedPain.length > 0 || matchedTopics.length > 0) && (
            <div className="mb-6 rounded-panel border border-line bg-panel p-5">
              <p className="text-[13px] font-medium">Also matching “{q}”</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {matchedPain.map((m) => <Link key={m.pain_point_key} href={href({ key: m.pain_point_key, q: null })} className="tag border border-line bg-paper text-ink-2 hover:border-violet">Pain point: {m.label}</Link>)}
                {matchedTopics.map((t) => <Link key={t.slug} href={href({ topic: t.slug, q: null })} className="tag border border-line bg-paper text-ink-2 hover:border-violet">Topic: {t.name}</Link>)}
              </div>
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            <span>{total} discussion{total === 1 ? '' : 's'}</span>
            {keyLabel && <Link href={href({ key: null })} className="tag bg-violet-soft text-violet-ink">Pain point: {keyLabel} ✕<span className="sr-only">remove filter</span></Link>}
          </div>
          {rows.length ? (
            <ul className="space-y-3">{rows.map((d) => <DiscussionItem key={d.id} d={d} topicNames={topicNames} />)}</ul>
          ) : <Empty title="No discussions match">Try another week, a broader search, or reset the filters.</Empty>}
          {total > pageSize && (
            <nav className="mt-6 flex items-center justify-between text-[13px]" aria-label="Pagination">
              {page > 1 ? <Link href={href({ page: String(page - 1) })} className="pill">Newer</Link> : <span />}
              <span className="text-ink-muted">Page {page} of {Math.ceil(total / pageSize)}</span>
              {page * pageSize < total ? <Link href={href({ page: String(page + 1) })} className="pill">Older</Link> : <span />}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-medium text-ink-muted">{label}</span>{children}</label>;
}

function DiscussionItem({ d, topicNames }: { d: DiscussionRow; topicNames: Record<string, string> }) {
  const analysed = d.analysis_status === 'done' && d.kind;
  const pain = d.kind === 'workflow_pain' || d.kind === 'unmet_need';
  return (
    <li className="grid gap-0 overflow-hidden rounded-panel border border-line bg-panel md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"><SourceChip id={d.source_id} full /><span>{fmtDate(d.created_at_source, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>{d.comment_count !== null && <span>{d.comment_count} replies</span>}{d.score !== null && <span>{d.score} points</span>}</div>
        <a href={d.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 flex items-start gap-1.5 text-[16px] font-medium leading-snug hover:text-violet-ink">{d.title}<ExternalLink size={13} className="mt-1.5 shrink-0 text-ink-faint" aria-hidden="true" /><span className="sr-only">(opens in new tab)</span></a>
        <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-ink-2">{d.body_excerpt || 'No text — title only.'}</p>
      </div>
      <div className={`border-t border-line p-5 md:border-l md:border-t-0 ${pain ? 'bg-violet-soft/35' : 'bg-paper/60'}`}>
        {analysed ? (
          <>
            <div className="flex flex-wrap items-center gap-2"><AiMark /><span className={`tag h-5 px-2 text-[11px] ${pain ? 'bg-coal text-coal-text' : 'bg-sunk text-ink-2'}`}>{KIND[d.kind!]}</span>{d.topic_slug && <span className="text-xs text-ink-muted">{topicNames[d.topic_slug] ?? d.topic_slug}</span>}</div>
            {d.pain_label && <p className="mt-2.5 text-[14px] font-medium">{d.pain_label}</p>}
            <dl className="mt-2 space-y-1 text-[13px] text-ink-2">
              {d.reported_impact && <div><dt className="inline text-ink-muted">Impact: </dt><dd className="inline">{d.reported_impact}</dd></div>}
              {d.existing_workaround && <div><dt className="inline text-ink-muted">Workaround: </dt><dd className="inline">{d.existing_workaround}</dd></div>}
              <div><dt className="inline text-ink-muted">Status: </dt><dd className="inline">{RES[d.resolution_status ?? 'unknown']}{d.confidence !== null && <span className="text-ink-muted"> · confidence {d.confidence}</span>}</dd></div>
            </dl>
            {d.evidence_verified && d.evidence_quote && <p className="mt-2.5 border-l-2 border-violet-line pl-2.5 text-[13px] italic text-ink-2">“{d.evidence_quote}” <span className="not-italic text-ink-faint">verified</span></p>}
          </>
        ) : <p className="text-[13px] text-ink-muted">{d.analysis_status === 'failed' ? 'Analysis failed; it will be retried on the next run.' : 'Waiting for analysis. Run Generate report to process the queue.'}</p>}
      </div>
    </li>
  );
}
