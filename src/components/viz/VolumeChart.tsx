import { fmtWeekEnd } from '@/lib/format';
import type { WeekVolume } from '@/lib/queries';

/**
 * Weekly volume as lollipop bars: full height = unique discussions collected,
 * dark core = discussions classified as pain. Current week emphasised.
 */
export function VolumeChart({ data }: { data: WeekVolume[] }) {
  const max = Math.max(1, ...data.map((d) => d.collected));
  const H = 132;
  const hasData = data.some((d) => d.collected > 0);
  if (!hasData) return <p className="py-10 text-center text-sm text-ink-muted">Volume appears after the first collection.</p>;
  return (
    <figure>
      <div className="flex h-[168px] items-end gap-2" role="img" aria-label={`Weekly discussions, oldest to newest: ${data.map((d) => `${fmtWeekEnd(d.week_end)} ${d.collected} collected, ${d.pain} pain`).join('; ')}`}>
        {data.map((d, i) => {
          const cur = i === data.length - 1;
          const h = Math.max(6, (d.collected / max) * H), ph = d.collected ? (d.pain / d.collected) * h : 0;
          return (
            <div key={d.week_end} className="group relative flex flex-1 flex-col items-center justify-end" title={`Week ending ${fmtWeekEnd(d.week_end)}: ${d.collected} discussions, ${d.pain} describing pain`}>
              <span className={`mb-1.5 text-[11px] font-medium tabular-nums ${cur ? 'rounded-full bg-coal px-1.5 py-0.5 text-coal-text' : 'text-ink-faint opacity-0 transition-opacity group-hover:opacity-100'}`}>{d.collected}</span>
              <div className={`relative w-2.5 overflow-hidden rounded-full ${cur ? 'bg-teal' : 'bg-teal-soft'}`} style={{ height: h }}>
                <div className={`absolute inset-x-0 bottom-0 rounded-full ${cur ? 'bg-coal' : 'bg-teal-ink/60'}`} style={{ height: ph }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">{data.map((d, i) => <span key={d.week_end} className={`flex-1 text-center text-[11px] ${i === data.length - 1 ? 'font-medium text-ink' : 'text-ink-faint'}`}>{fmtWeekEnd(d.week_end)}</span>)}</div>
      <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-teal" aria-hidden="true" />Unique discussions collected</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-coal" aria-hidden="true" />Describing a pain point</span>
      </figcaption>
    </figure>
  );
}
