export interface Segment { label: string; value: number; className: string; hatch?: boolean }
/** Segmented share bar with gaps between parts (Crextio-style); hatched = unknown/pending. */
export function SegmentBar({ segments, height = 'h-9', dark = false, showLabels = true }: { segments: Segment[]; height?: string; dark?: boolean; showLabels?: boolean }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return <div className={`${height} rounded-full ${dark ? 'hatch-dark bg-coal-2' : 'hatch bg-sunk'}`} aria-label="No data" role="img" />;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className={`flex ${height} ${showLabels ? 'gap-1' : 'gap-0.5'}`} role="img" aria-label={shown.map((s) => `${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`).join(', ')}>
      {shown.map((s) => (
        <div key={s.label} className={`flex ${showLabels ? 'min-w-[10px] px-3' : 'min-w-[4px]'} items-center overflow-hidden rounded-full ${s.className} ${s.hatch ? (dark ? 'hatch-dark' : 'hatch') : ''}`} style={{ flexGrow: s.value, flexBasis: 0 }} title={`${s.label}: ${s.value}`}>
          {showLabels && s.value / total >= 0.14 && <span className="truncate text-[12px] font-medium">{Math.round((s.value / total) * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}
