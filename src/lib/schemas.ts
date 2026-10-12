import { z } from 'zod';
import { quoteIsVerbatim, slugify, truncate } from './text';
import type { Synthesis } from './types';

const kind = z.enum(['workflow_pain', 'unmet_need', 'isolated_bug', 'how_to_question', 'opinion', 'not_relevant']);
const resolution = z.enum(['unresolved', 'partially_resolved', 'resolved', 'unknown']);
// Length limits TRIM rather than reject: live, one discussion naming 11 tools made Gemini's whole batch of 10 fail.
// Wrong types or unknown enum values still reject, because that output really is malformed.
const clip = (n: number) => z.string().transform((v) => truncate(v.trim(), n));
const clipList = <T extends z.ZodTypeAny>(item: T, n: number) => z.array(item).transform((a) => a.slice(0, n));
const optStr = z.string().nullish().transform((v) => (v && v.trim() ? truncate(v.trim(), 600) : null));

export const analysisItemSchema = z.object({
  ref: z.string(),
  is_relevant: z.boolean(),
  kind,
  pain_point_key: z.string().nullish(),
  pain_point_label: z.string().nullish(),
  topic_slug: z.string().nullish(),
  affected_workflow: optStr,
  reported_impact: optStr,
  existing_workaround: optStr,
  tools_mentioned: clipList(clip(60), 10).nullish(),
  resolution_status: resolution,
  evidence_quote: z.string().nullish(), // verified verbatim first, truncated afterwards in cleanAnalysis
  confidence: z.number().transform((n) => Math.min(1, Math.max(0, n))),
});
export const analysisBatchSchema = z.object({ items: z.array(analysisItemSchema) });
export type AnalysisItem = z.infer<typeof analysisItemSchema>;

export interface CleanAnalysis {
  is_relevant: boolean;
  kind: z.infer<typeof kind>;
  pain_point_key: string | null;
  pain_point_label: string | null;
  topic_slug: string | null;
  affected_workflow: string | null;
  reported_impact: string | null;
  existing_workaround: string | null;
  tools_mentioned: string[];
  resolution_status: z.infer<typeof resolution>;
  evidence_quote: string | null;
  evidence_verified: boolean;
  confidence: number;
}

/** Validate and harden one model judgement against the source text it claims to describe. */
export function cleanAnalysis(item: AnalysisItem, sourceText: string, allowedTopics: Set<string>): CleanAnalysis {
  const relevant = item.is_relevant && item.kind !== 'not_relevant';
  const key = relevant && item.pain_point_key ? slugify(item.pain_point_key) : '';
  const verified = quoteIsVerbatim(item.evidence_quote, sourceText);
  let confidence = Math.round(item.confidence * 100) / 100;
  if (!verified) confidence = Math.min(confidence, 0.4); // unverifiable evidence caps confidence
  return {
    is_relevant: relevant,
    kind: relevant ? item.kind : 'not_relevant',
    pain_point_key: key.length >= 3 ? key : null,
    pain_point_label: relevant && item.pain_point_label ? truncate(item.pain_point_label.trim(), 80) : null,
    topic_slug: item.topic_slug && allowedTopics.has(item.topic_slug) ? item.topic_slug : null,
    affected_workflow: item.affected_workflow ?? null,
    reported_impact: item.reported_impact ?? null,
    existing_workaround: item.existing_workaround ?? null,
    tools_mentioned: (item.tools_mentioned ?? []).map((t) => t.trim()).filter(Boolean),
    resolution_status: item.resolution_status,
    evidence_quote: verified ? truncate(item.evidence_quote!.trim(), 400) : null,
    evidence_verified: verified,
    confidence,
  };
}

const synthesisSchema = z.object({
  headline: clip(300),
  findings: clipList(z.object({ title: clip(140), insight: clip(700), pain_point_keys: z.array(z.string()), evidence_ids: z.array(z.string()) }), 8),
  underserved: clipList(z.object({ pain_point_key: z.string(), why: clip(500), evidence_ids: z.array(z.string()) }), 8),
  investigate: clipList(z.object({ recommendation: clip(240), rationale: clip(500), pain_point_keys: z.array(z.string()), evidence_ids: z.array(z.string()) }), 6),
  caveats: clipList(clip(300), 6),
});

/** Remove any claim that does not cite evidence we actually supplied. */
export function validateSynthesis(raw: unknown, allowedEvidence: Set<string>, allowedKeys: Set<string>): Synthesis {
  const s = synthesisSchema.parse(raw);
  let dropped = 0;
  const keepIds = (ids: string[]) => ids.filter((id) => allowedEvidence.has(id));
  const keepKeys = (ks: string[]) => ks.filter((k) => allowedKeys.has(k));
  const findings = s.findings.map((f) => ({ ...f, evidence_ids: keepIds(f.evidence_ids), pain_point_keys: keepKeys(f.pain_point_keys) })).filter((f) => (f.evidence_ids.length ? true : (dropped++, false)));
  const underserved = s.underserved.map((u) => ({ ...u, evidence_ids: keepIds(u.evidence_ids) })).filter((u) => (u.evidence_ids.length && allowedKeys.has(u.pain_point_key) ? true : (dropped++, false)));
  const investigate = s.investigate.map((i) => ({ ...i, evidence_ids: keepIds(i.evidence_ids), pain_point_keys: keepKeys(i.pain_point_keys) })).filter((i) => (i.evidence_ids.length ? true : (dropped++, false)));
  return { headline: s.headline, findings, underserved, investigate, caveats: s.caveats, dropped_unsupported: dropped };
}
