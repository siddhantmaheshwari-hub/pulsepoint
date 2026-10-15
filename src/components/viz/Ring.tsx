import type { ReactNode } from 'react';

export interface RingSegment { label: string; value: number; color: string }

/**
 * Donut ring: segments drawn clockwise from 12 o'clock with small gaps; empty = hatched-looking track.
 * Always paired with a text legend or label, and exposes its values to screen readers.
 */
export function Ring({ segments, size = 96, thickness = 9, center, label, track = '#EEEBE3' }: {
  segments: RingSegment[]; size?: number; thickness?: number; center?: ReactNode; label: string; track?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const gap = shown.length > 1 ? Math.min(4, c * 0.015) : 0;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img"
      aria-label={`${label}: ${total ? shown.map((s) => `${s.label} ${s.value} (${Math.round((s.value / total) * 100)}%)`).join(', ') : 'no data'}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {total > 0 && shown.map((s) => {
          const len = Math.max(0, (s.value / total) * c - gap);
          const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeLinecap="butt"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += (s.value / total) * c;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}
