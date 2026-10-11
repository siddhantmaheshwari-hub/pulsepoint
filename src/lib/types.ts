export type SourceId = 'hackernews' | 'stackoverflow' | 'github';
export const SOURCE_LABEL: Record<SourceId, string> = { hackernews: 'Hacker News', stackoverflow: 'Stack Overflow', github: 'GitHub Issues' };

export type Kind = 'workflow_pain' | 'unmet_need' | 'isolated_bug' | 'how_to_question' | 'opinion' | 'not_relevant';
export type Resolution = 'unresolved' | 'partially_resolved' | 'resolved' | 'unknown';
export const PAIN_KINDS: Kind[] = ['workflow_pain', 'unmet_need'];

export interface EvidenceItem {
  discussion_id: string;
  source_id: SourceId;
  title: string;
  url: string;
  created_at: string;
  quote: string | null;
  quote_verified: boolean;
  resolution_status: Resolution;
  confidence: number;
  workaround: string | null;
}

export interface TopicMetricRow {
  pain_point_key: string;
  label: string;
  topic_slug: string | null;
  current_count: number;
  previous_count: number;
  abs_change: number;
  pct_change: number | null;
  trend: import('./trends').Trend;
  distinct_sources: number;
  by_source: Partial<Record<SourceId, { current: number; previous: number }>>;
  first_observed: string | null;
  last_observed: string | null;
  unresolved_count: number;
  bug_reports: number;
  avg_confidence: number | null;
  verified_share: number | null;
  sufficiency: import('./trends').Sufficiency;
  underserved: boolean;
  evidence: EvidenceItem[];
}

export interface Synthesis {
  headline: string;
  findings: { title: string; insight: string; pain_point_keys: string[]; evidence_ids: string[] }[];
  underserved: { pain_point_key: string; why: string; evidence_ids: string[] }[];
  investigate: { recommendation: string; rationale: string; pain_point_keys: string[]; evidence_ids: string[] }[];
  caveats: string[];
  dropped_unsupported: number;
}
