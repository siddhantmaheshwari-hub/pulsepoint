/** Tiny weekly series. null = no report stored that week (gap, not zero). Last point emphasised. */
export function Sparkline({ values, color = '#17191E', width = 88, height = 26, label }: { values: (number | null)[]; color?: string; width?: number; height?: number; label: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-xs text-ink-faint" aria-label={`${label}: not enough history`}>—</span>;
  const max = Math.max(1, ...nums), step = width / Math.max(1, values.length - 1), pad = 3;
  const y = (v: number) => pad + (height - 2 * pad) * (1 - v / max);
  let d = '', pen = false;
  values.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
  const li = values.length - 1, last = values[li];
  return (
    <svg width={width} height={height} viewBox={`-2 0 ${width + 4} ${height}`} role="img" aria-label={`${label}: ${values.map((v) => v ?? 'no report').join(', ')}`}>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last !== null && <circle cx={li * step} cy={y(last)} r={2.8} fill={color} />}
    </svg>
  );
}
