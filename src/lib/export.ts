import { formatPct, type Trend } from './trends';
import type { Synthesis, TopicMetricRow } from './types';

const TREND_WORD: Record<Trend, string> = { rising: 'Rising', declining: 'Easing', stable: 'Stable', new: 'New', gone: 'Not seen', none: 'No data' };
/** Zero baseline is always "New", never a percentage. */
export function trendLabel(trend: Trend, pct: number | null): string {
  return trend === 'new' || trend === 'gone' || trend === 'none' ? TREND_WORD[trend] : `${TREND_WORD[trend]} ${formatPct({ trend, pctChange: pct })}`;
}

export interface ExportInput {
  periodLabel: string;
  url: string | null;
  totals: Record<string, number>; // the report snapshot's deterministic totals
  metrics: TopicMetricRow[];
  synthesis: Synthesis | null;
}

/** Markdown for pasting into sprint-planning notes. Numbers come from the stored snapshot; AI text is labelled. */
export function briefMarkdown({ periodLabel, url, totals: t, metrics, synthesis: s }: ExportInput): string {
  const evidence = new Map(metrics.flatMap((m) => m.evidence.map((e) => [e.discussion_id, e] as const)));
  const label = new Map(metrics.map((m) => [m.pain_point_key, m.label]));
  const links = (ids: string[]) => ids.map((id) => evidence.get(id)).filter(Boolean).slice(0, 3).map((e) => `[${e!.title.replace(/[[\]]/g, '')}](${e!.url})`).join(' · ');
  const out: string[] = [`# PulsePoint brief: ${periodLabel}`, ''];
  if (s?.headline) out.push(`**${s.headline}** _(AI reading)_`, '');
  out.push(`${t.pain_discussions} discussions described a workflow pain or unmet need (${t.pain_discussions_previous} the week before), across ${t.pain_points_tracked} pain points: ${t.rising} rising, ${t.new} newly observed, ${t.declining} easing. ${t.discussions_analyzed} unique discussions analysed. Counts are computed by code.`, '');

  const active = metrics.filter((m) => m.current_count > 0).slice(0, 8);
  if (active.length) {
    out.push('## Pain points', '', '| Pain point | This week | Last week | Trend | Unresolved | Data |', '|---|---:|---:|---|---:|---|');
    for (const m of active) out.push(`| ${m.label.replace(/\|/g, '/')} | ${m.current_count} | ${m.previous_count} | ${trendLabel(m.trend, m.pct_change)} | ${m.unresolved_count}/${m.current_count} | ${m.sufficiency} |`);
    out.push('');
  }
  const underserved = metrics.filter((m) => m.underserved);
  if (underserved.length) {
    out.push('## Underserved problems', '');
    for (const m of underserved) {
      const why = s?.underserved.find((u) => u.pain_point_key === m.pain_point_key);
      out.push(`- **${m.label}**: ${m.unresolved_count} of ${m.current_count} unresolved.${why ? ` _AI reading:_ ${why.why}` : ''}`);
      const l = links(why?.evidence_ids ?? m.evidence.slice(0, 2).map((e) => e.discussion_id));
      if (l) out.push(`  - Evidence: ${l}`);
    }
    out.push('');
  }
  if (s?.investigate.length) {
    out.push('## Worth investigating before Monday _(AI suggestions, not decisions)_', '');
    s.investigate.forEach((r, i) => {
      out.push(`${i + 1}. **${r.recommendation}**: ${r.rationale}`);
      if (r.pain_point_keys.length) out.push(`   - Related: ${r.pain_point_keys.map((k) => label.get(k) ?? k).join(', ')}`);
      const l = links(r.evidence_ids);
      if (l) out.push(`   - Evidence: ${l}`);
    });
    out.push('');
  }
  if (s?.caveats.length) out.push('## Caveats _(AI)_', '', ...s.caveats.map((c) => `- ${c}`), '');
  if (url) out.push(`Full brief: ${url}`);
  return out.join('\n').trim() + '\n';
}
