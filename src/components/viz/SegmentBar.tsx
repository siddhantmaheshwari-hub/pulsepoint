export interface Segment { label: string; value: number; className: string; hatch?: boolean }
/** Segmented share bar with gaps between parts (Crextio-style); hatched = unknown/pending. */
export function SegmentBar({ segments, height = 'h-9', dark = false }: { segments: Segment[]; height?: string; dark?: boolean }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return <div className={`${height} rounded-full ${dark ? 'hatch-dark bg-coal-2' : 'hatch bg-sunk'}`} aria-label="No data" role="img" />;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className={`flex ${height} gap-1`} role="img" aria-label={shown.map((s) => `${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`).join(', ')}>
      {shown.map((s) => (
        <div key={s.label} className={`flex min-w-[10px] items-center overflow-hidden rounded-full px-3 ${s.className} ${s.hatch ? (dark ? 'hatch-dark' : 'hatch') : ''}`} style={{ flexGrow: s.value, flexBasis: 0 }} title={`${s.label}: ${s.value}`}>
          {s.value / total >= 0.14 && <span className="truncate text-[12px] font-medium">{Math.round((s.value / total) * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}
