import { describe, expect, it } from 'vitest';
import { analysisBatchSchema, analysisItemSchema, cleanAnalysis, validateSynthesis } from '@/lib/schemas';
import { parseModelJson } from '@/lib/gemini';

const source = 'TITLE\nOur review bot flags 40 issues per PR and maybe two are real, so the team just ignores it now.';
const topics = new Set(['automated-review']);
const base = { ref: 'd1', is_relevant: true, kind: 'workflow_pain' as const, pain_point_key: 'Review Bot False Positives', pain_point_label: 'Noisy review bots', topic_slug: 'automated-review', resolution_status: 'unresolved' as const, evidence_quote: 'flags 40 issues per PR and maybe two are real', confidence: 0.9 };

describe('analysis validation', () => {
  it('rejects malformed model output', () => {
    expect(analysisBatchSchema.safeParse({ items: [{ ref: 'd1', kind: 'angry', confidence: 2 }] }).success).toBe(false);
    expect(analysisBatchSchema.safeParse({ nope: [] }).success).toBe(false);
  });
  it('normalizes keys and keeps verified quotes', () => {
    const c = cleanAnalysis(analysisItemSchema.parse(base), source, topics);
    expect(c.pain_point_key).toBe('review-bot-false-positives');
    expect(c.evidence_verified).toBe(true);
    expect(c.confidence).toBe(0.9);
  });
  it('drops invented quotes and caps confidence', () => {
    const c = cleanAnalysis(analysisItemSchema.parse({ ...base, evidence_quote: 'the bot is completely useless and wrong' }), source, topics);
    expect(c.evidence_quote).toBeNull();
    expect(c.evidence_verified).toBe(false);
    expect(c.confidence).toBe(0.4);
  });
  it('discards unknown topics and keys for irrelevant items', () => {
    const c = cleanAnalysis(analysisItemSchema.parse({ ...base, topic_slug: 'crypto', is_relevant: false }), source, topics);
    expect(c.topic_slug).toBeNull();
    expect(c.pain_point_key).toBeNull();
    expect(c.kind).toBe('not_relevant');
  });
});

describe('parseModelJson', () => {
  it('strips code fences and throws on garbage', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseModelJson('Sure! Here is the JSON:')).toThrow(/malformed/);
  });
});

describe('validateSynthesis', () => {
  const raw = {
    headline: 'Review-bot noise keeps coming up',
    findings: [
      { title: 'Supported', insight: 'x', pain_point_keys: ['k1', 'invented-key'], evidence_ids: ['e1', 'fake'] },
      { title: 'Unsupported', insight: 'y', pain_point_keys: ['k1'], evidence_ids: ['fake'] },
    ],
    underserved: [{ pain_point_key: 'k1', why: 'z', evidence_ids: ['e2'] }, { pain_point_key: 'nope', why: 'z', evidence_ids: ['e2'] }],
    investigate: [{ recommendation: 'Interview 3 teams', rationale: 'r', pain_point_keys: ['k1'], evidence_ids: [] }],
    caveats: ['small sample'],
  };
  it('removes claims without supplied evidence and unknown ids/keys', () => {
    const s = validateSynthesis(raw, new Set(['e1', 'e2']), new Set(['k1']));
    expect(s.findings).toHaveLength(1);
    expect(s.findings[0].evidence_ids).toEqual(['e1']);
    expect(s.findings[0].pain_point_keys).toEqual(['k1']);
    expect(s.underserved).toHaveLength(1);
    expect(s.investigate).toHaveLength(0);
    expect(s.dropped_unsupported).toBe(3);
  });
  it('throws on structurally invalid synthesis', () => {
    expect(() => validateSynthesis({ headline: 1 }, new Set(), new Set())).toThrow();
  });
});
