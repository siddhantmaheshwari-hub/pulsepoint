import { computeTrend, sufficiency } from './trends';
import { inWindow, type ReportWindows } from './windows';
import { PAIN_KINDS, type EvidenceItem, type Kind, type Resolution, type SourceId, type TopicMetricRow } from './types';

export interface AnalyzedRow {
  discussion_id: string;
  source_id: SourceId;
  title: string;
  url: string;
  created_at_source: string;
  score: number | null;
  is_relevant: boolean;
  kind: Kind;
  pain_point_key: string | null;
  topic_slug: string | null;
  resolution_status: Resolution;
  evidence_quote: string | null;
  evidence_verified: boolean;
  confidence: number;
  existing_workaround: string | null;
}

export interface PainPointInfo {
  label: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

const EVIDENCE_PER_POINT = 5;

/**
 * Deterministic aggregation. Unit of frequency = unique discussion (not keyword mentions).
 * Only relevant workflow pains / unmet needs count toward frequency; isolated bugs are reported separately.
 */
export function buildMetrics(rows: AnalyzedRow[], w: ReportWindows, info: Map<string, PainPointInfo>): TopicMetricRow[] {
  type Acc = {
    cur: Set<string>; prev: Set<string>; bugs: Set<string>;
    bySource: Map<SourceId, { cur: Set<string>; prev: Set<string> }>;
    unresolved: Set<string>; conf: number[]; verified: number; topics: Map<string, number>;
    evidence: AnalyzedRow[];
  };
  const groups = new Map<string, Acc>();
  const seen = new Set<string>();

  for (const r of rows) {
    if (!r.is_relevant || !r.pain_point_key) continue;
    if (seen.has(r.discussion_id)) continue; // guard against duplicate rows
    seen.add(r.discussion_id);
    const d = new Date(r.created_at_source);
    const isCur = inWindow(d, w.currentStart, w.currentEnd);
    const isPrev = inWindow(d, w.previousStart, w.previousEnd);
    if (!isCur && !isPrev) continue;

    let g = groups.get(r.pain_point_key);
    if (!g) {
      g = { cur: new Set(), prev: new Set(), bugs: new Set(), bySource: new Map(), unresolved: new Set(), conf: [], verified: 0, topics: new Map(), evidence: [] };
      groups.set(r.pain_point_key, g);
    }
    if (r.kind === 'isolated_bug') {
      if (isCur) g.bugs.add(r.discussion_id);
      continue;
    }
    if (!PAIN_KINDS.includes(r.kind)) continue;

    const src = g.bySource.get(r.source_id) ?? { cur: new Set<string>(), prev: new Set<string>() };
    g.bySource.set(r.source_id, src);
    if (isCur) {
      g.cur.add(r.discussion_id);
      src.cur.add(r.discussion_id);
      if (r.resolution_status === 'unresolved' || r.resolution_status === 'partially_resolved') g.unresolved.add(r.discussion_id);
      g.conf.push(r.confidence);
      if (r.evidence_verified) g.verified++;
      g.evidence.push(r);
    } else {
      g.prev.add(r.discussion_id);
      src.prev.add(r.discussion_id);
    }
    if (r.topic_slug) g.topics.set(r.topic_slug, (g.topics.get(r.topic_slug) ?? 0) + 1);
  }

  const out: TopicMetricRow[] = [];
  for (const [key, g] of groups) {
    const t = computeTrend(g.cur.size, g.prev.size);
    if (t.trend === 'none' && g.bugs.size === 0) continue;
    const distinctSources = [...g.bySource.values()].filter((s) => s.cur.size > 0).length;
    const by_source: TopicMetricRow['by_source'] = {};
    for (const [s, v] of g.bySource) by_source[s] = { current: v.cur.size, previous: v.prev.size };
    const topic = [...g.topics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const p = info.get(key);
    const evidence: EvidenceItem[] = g.evidence
      .sort((a, b) => Number(b.evidence_verified) - Number(a.evidence_verified) || b.confidence - a.confidence || (b.score ?? 0) - (a.score ?? 0))
      .slice(0, EVIDENCE_PER_POINT)
      .map((r) => ({
        discussion_id: r.discussion_id, source_id: r.source_id, title: r.title, url: r.url, created_at: r.created_at_source,
        quote: r.evidence_verified ? r.evidence_quote : null, quote_verified: r.evidence_verified,
        resolution_status: r.resolution_status, confidence: r.confidence, workaround: r.existing_workaround,
      }));
    const unresolvedShare = g.cur.size ? g.unresolved.size / g.cur.size : 0;
    out.push({
      pain_point_key: key,
      label: p?.label ?? key,
      topic_slug: topic,
      current_count: t.current,
      previous_count: t.previous,
      abs_change: t.absChange,
      pct_change: t.pctChange,
      trend: t.trend,
      distinct_sources: distinctSources,
      by_source,
      first_observed: p?.first_seen_at ?? null,
      last_observed: p?.last_seen_at ?? null,
      unresolved_count: g.unresolved.size,
      bug_reports: g.bugs.size,
      avg_confidence: g.conf.length ? Math.round((g.conf.reduce((a, b) => a + b, 0) / g.conf.length) * 100) / 100 : null,
      verified_share: g.cur.size ? Math.round((g.verified / g.cur.size) * 100) / 100 : null,
      sufficiency: sufficiency(t.current, t.previous, distinctSources),
      underserved: g.cur.size >= 2 && unresolvedShare >= 0.5,
      evidence,
    });
  }
  return out.sort((a, b) => b.current_count - a.current_count || b.abs_change - a.abs_change || a.label.localeCompare(b.label));
}
