/** Small multi-week history for dark panels: thin rounded bars, last one highlighted. */
export function Lollipops({ values, labels, accent = '#E3B33E', label }: { values: (number | null)[]; labels: string[]; accent?: string; label: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div>
      <div className="flex h-24 items-end gap-3" role="img" aria-label={`${label}: ${values.map((v, i) => `${labels[i]} ${v ?? 'no report'}`).join(', ')}`}>
        {values.map((v, i) => {
          const last = i === values.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${labels[i]}: ${v ?? 'no report'}`}>
              {v === null ? <div className="hatch-dark h-6 w-1.5 rounded-full" /> : (
                <div className="flex flex-col items-center">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: last ? accent : '#F2F0EA' }} />
                  <span className="-mt-0.5 w-[3px] rounded-b-full" style={{ height: Math.max(4, (v / max) * 72), background: last ? accent : 'rgba(242,240,234,.35)' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">{labels.map((l, i) => <span key={i} className={`flex-1 text-center text-[10px] ${i === labels.length - 1 ? 'text-coal-text' : 'text-coal-muted'}`}>{l}</span>)}</div>
    </div>
  );
}
