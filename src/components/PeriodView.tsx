import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import { PainTable } from '@/components/pain/PainTable';
import { Empty, Metric } from '@/components/ui/bits';
import { VolumeChart } from '@/components/viz/VolumeChart';
import { fmtDate, fmtWeekEnd, plural } from '@/lib/format';
import { getPeriodVolume, loadWindowMetrics, monitoringSince } from '@/lib/period-data';
import { periodParams, type Period } from '@/lib/periods';
import { getSparklines, listTopics } from '@/lib/queries';

type Ok = Extract<Period, { w: unknown }>;

/**
 * Month / Range view: numbers only, computed on the fly from stored analyses with the same code as the weekly report.
 * No AI text and no AI call — the AI-written brief exists only for weekly snapshots.
 */
export async function PeriodView({ period, compare }: { period: Ok; compare: boolean }) {
  const { w, days, label } = period;
  const since = await monitoringSince();
  const start = w.currentStart.getTime(), end = w.currentEnd.getTime();
  const notMonitored = since === null || end <= since;
  // Which part predates monitoring: the selected period itself (counts incomplete) or only the comparison (trends overstated).
  const gap = notMonitored ? null : start < since! ? 'current' : w.previousStart.getTime() < since! ? 'previous' : null;
  const runsToNow = end > Date.now();

  const weekHref = '/';
  const discussionsHref = `/discussions?${new URLSearchParams({ ...periodParams(period), kind: 'pain' })}`;
  const note = (
    <div className="flex gap-3 rounded-panel border border-violet-line bg-violet-soft/50 px-5 py-4 text-sm text-ink-2">
      <Info size={16} className="mt-0.5 shrink-0 text-violet-ink" aria-hidden="true" />
      <p>Numbers only. The AI-written brief is produced weekly — <Link href={weekHref} className="link underline underline-offset-2">switch to Week</Link> to read it.</p>
    </div>
  );

  if (notMonitored) {
    return (
      <div className="space-y-6">
        <Header label={label} days={days} />
        {note}
        <Empty title="Not monitored yet">PulsePoint wasn’t collecting discussions during {label}{since ? `; monitoring covers ${fmtDate(new Date(since).toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })} onwards` : ''}. A gap is not the same as zero.</Empty>
      </div>
    );
  }

  const [{ rows, metrics }, { topics }] = await Promise.all([loadWindowMetrics(w), listTopics()]);
  const bucketDays = days <= 31 ? 1 : 7;
  const [allVolume, { periods, series }] = await Promise.all([
    getPeriodVolume(w.currentStart, w.currentEnd, bucketDays, since),
    getSparklines(metrics.map((m) => m.pain_point_key), w.currentEnd.toISOString()),
  ]);
  // Days after today haven't happened yet: leave them off the chart rather than drawing zeros.
  const volume = allVolume.filter((v) => Date.parse(v.week_end) - bucketDays * 86_400_000 < Date.now());
  const topicNames = Object.fromEntries(topics.map((t) => [t.slug, t.name]));
  const active = metrics.filter((m) => m.current_count > 0);
  const pain = metrics.reduce((a, m) => a + m.current_count, 0);
  const painPrev = metrics.reduce((a, m) => a + m.previous_count, 0);
  const analysed = rows.filter((r) => Date.parse(r.created_at_source) >= start).length;
  const count = (t: string) => metrics.filter((m) => m.trend === t).length;
  const prevLabel = `the previous ${days} days`;

  return (
    <div className="space-y-6">
      <section className="grid gap-8 pb-2 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <Header label={label} days={days} />
          <h1 className="mt-3 max-w-[30ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[34px]">
            {plural(pain, 'discussion')} described a workflow pain or unmet need, across {plural(active.length, 'pain point')}.
          </h1>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
            {compare ? `${painPrev} in ${prevLabel}. ` : ''}{count('rising')} rising, {count('new')} newly observed, {count('declining')} easing. Counts are unique discussions, computed by code.
          </p>
          <div className="mt-5">{note}</div>
          {(gap || runsToNow) && (
            <ul className="mt-4 space-y-1.5 text-[13px] text-rise">
              {gap === 'current' && <li>Monitoring began on {fmtDate(new Date(since!).toISOString(), { day: 'numeric', month: 'short' })}, partway through this period. Earlier days were not collected (hatched in the chart), so counts are incomplete and “New” labels may be overstated.</li>}
              {gap === 'previous' && <li>Part of the comparison period is before monitoring began ({fmtDate(new Date(since!).toISOString(), { day: 'numeric', month: 'short' })}), so “New” and rising labels may be overstated.</li>}
              {runsToNow && <li>This period runs to {fmtWeekEnd(w.currentEnd.toISOString())}; days after today have no data yet.</li>}
            </ul>
          )}
        </div>
        <div className="lg:col-span-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-panel border border-line bg-panel p-6">
            <Metric value={pain} label="Pain discussions" sub={compare ? `${painPrev} in ${prevLabel}` : undefined} />
            <Metric value={active.length} label="Pain points" sub="with at least one discussion" />
            <Metric value={count('new')} label="Newly observed" sub={`none in ${prevLabel}`} accent={count('new') ? '#A06A08' : undefined} />
            <Metric value={analysed} label="Unique discussions analysed" sub={`${days} days`} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h-panel">What developers struggled with</h2>
          <Link href={discussionsHref} className="link inline-flex items-center gap-1 text-[13px]">Open these discussions<ArrowRight size={13} aria-hidden="true" /></Link>
        </div>
        {metrics.length
          ? <PainTable metrics={metrics} sparks={series} sparkLabels={periods.map(fmtWeekEnd)} topics={topicNames} periodStart={w.currentStart.toISOString()} compare={compare} unit="period" />
          : <Empty title="No pain points in this period">Discussions may have been collected, but none described a workflow pain.</Empty>}
        <p className="meta mt-3 max-w-3xl">Compared with {prevLabel}. Rising or easing needs a change of at least 2 discussions and 25%; a zero baseline shows “New”. The 8-week sparkline comes from stored weekly reports.</p>
      </section>

      <section className="panel panel-pad">
        <h2 className="h-panel">Discussion volume</h2>
        <p className="meta mt-0.5">Unique discussions per {bucketDays === 1 ? 'day' : 'week'}, {label}</p>
        <div className="mt-5"><VolumeChart data={volume} bucket={bucketDays === 1 ? 'day' : 'week'} /></div>
      </section>
    </div>
  );
}

function Header({ label, days }: { label: string; days: number }) {
  return <p className="eyebrow">{label} · {days} days · numbers only</p>;
}
