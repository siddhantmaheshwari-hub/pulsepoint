import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBriefEmail, CLAIM_SQL, MARK_FAILED_SQL, MARK_SENT_SQL, maskEmail, parseRecipients } from '@/lib/email';
import type { TopicMetricRow } from '@/lib/types';

const ev = (id: string, title: string, url = `https://news.ycombinator.com/item?id=${id}`) => ({ discussion_id: id, source_id: 'hackernews' as const, title, url, created_at: '2026-10-09T00:00:00Z', quote: null, quote_verified: false, resolution_status: 'unresolved' as const, confidence: 0.9, workaround: null });
const metric = (o: Partial<TopicMetricRow>): TopicMetricRow => ({
  pain_point_key: 'k', label: 'L', topic_slug: null, current_count: 0, previous_count: 0, abs_change: 0, pct_change: null, trend: 'none', distinct_sources: 1, by_source: {},
  first_observed: null, last_observed: null, unresolved_count: 0, bug_reports: 0, avg_confidence: 0.9, verified_share: 1, sufficiency: 'limited', underserved: false, evidence: [], ...o,
});

describe('buildBriefEmail', () => {
  const input = {
    reportId: '11111111-2222-3333-4444-555555555555', periodLabel: '5 Oct – 11 Oct 2026', appUrl: 'https://pulse.example/',
    totals: { pain_discussions: 7, pain_discussions_previous: 4, pain_points_tracked: 2, rising: 1, new: 1, declining: 0 },
    metrics: [
      metric({ pain_point_key: 'ai-pr', label: 'Reviewing <script>alert(1)</script> AI PRs', current_count: 6, previous_count: 4, pct_change: 50, trend: 'rising', unresolved_count: 6, underserved: true, evidence: [ev('1', 'Ask HN: "PR apocalypse" & more')] }),
      metric({ pain_point_key: 'ci', label: 'CI outage blocks deploys', current_count: 1, trend: 'new', evidence: [ev('2', 'Bad link', 'javascript:alert(1)')] }),
      metric({ pain_point_key: 'gone', label: 'Not seen this week', current_count: 0, previous_count: 2, trend: 'gone' }),
    ],
    synthesis: { headline: 'AI PR volume strains review', findings: [], underserved: [{ pain_point_key: 'ai-pr', why: 'No tool triages AI PRs.', evidence_ids: ['1'] }], investigate: [{ recommendation: 'Interview review leads', rationale: 'Backlogs are growing.', pain_point_keys: ['ai-pr'], evidence_ids: ['1'] }], caveats: [], dropped_unsupported: 0 },
  };
  const { subject, html, text } = buildBriefEmail(input);

  it('contains the headline, numbers from the snapshot and change labels', () => {
    expect(subject).toBe('PulsePoint Friday brief: 5 Oct – 11 Oct 2026');
    expect(html).toContain('AI PR volume strains review');
    expect(html).toContain('6 this week · 4 last week');
    expect(html).toContain('Rising +50%');
    expect(html).toContain('>New<');
    expect(html).not.toContain('Not seen this week'); // only active pain points
    expect(text).toContain('7 discussions described a workflow pain or unmet need this week (4 the week before)');
  });
  it('labels AI text, links evidence and the full brief', () => {
    expect(html).toContain('AI reading');
    expect(text).toContain('AI PR volume strains review (AI reading)');
    expect(html).toContain('href="https://news.ycombinator.com/item?id=1"');
    expect(html).toContain('href="https://pulse.example/?report=11111111-2222-3333-4444-555555555555"');
    expect(html).toContain('Open the full brief');
    expect(html).toContain('Interview review leads');
    expect(html).toContain('Underserved problems');
  });
  it('escapes HTML in community titles and drops non-http links', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('Reviewing &lt;script&gt;alert(1)&lt;/script&gt; AI PRs');
    expect(html).toContain('Ask HN: &quot;PR apocalypse&quot; &amp; more');
    expect(html).not.toContain('javascript:');
  });
  it('never prints "undefined" or "null", even with no AI synthesis and no app URL', () => {
    const bare = buildBriefEmail({ ...input, appUrl: '', synthesis: null, totals: {} });
    for (const s of [html, text, bare.html, bare.text]) { expect(s).not.toContain('undefined'); expect(s).not.toMatch(/\bnull\b/); expect(s).not.toContain('NaN'); }
    expect(bare.html).not.toContain('Open the full brief');
    expect(bare.html).not.toContain('>AI reading</span>'); // no AI badge when there is no AI text
  });
});

describe('recipients', () => {
  it('parses a comma-separated list and masks addresses', () => {
    expect(parseRecipients(' sumit@gmail.com, , not-an-email ,neha@team.dev')).toEqual(['sumit@gmail.com', 'neha@team.dev']);
    expect(parseRecipients(undefined)).toEqual([]);
    expect(maskEmail('sumit@gmail.com')).toBe('s***@gmail.com');
  });
});

describe('a brief is never emailed twice', () => {
  const pg = new PGlite();
  const week = '2026-10-08T18:30:00.000Z';
  const r1 = 'aaaaaaaa-0000-0000-0000-000000000001';
  const r2 = 'aaaaaaaa-0000-0000-0000-000000000002';
  const claim = async (report: string, end = week) => (await pg.query<{ id: string }>(CLAIM_SQL, [report, end, 'sumit@gmail.com'])).rows[0]?.id ?? null;

  beforeAll(async () => {
    await pg.exec(`create table public.reports (id uuid primary key);
      insert into public.reports values ('${r1}'), ('${r2}'), ('aaaaaaaa-0000-0000-0000-000000000003');`);
    await pg.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '0005_brief_emails.sql'), 'utf8'));
  });
  afterAll(() => pg.close());

  it('first claim wins; a second claim for the same week gets nothing', async () => {
    const id = await claim(r1);
    expect(id).not.toBeNull();
    expect(await claim(r1)).toBeNull(); // still sending
    await pg.query(MARK_SENT_SQL, [id]);
    expect(await claim(r1)).toBeNull(); // sent
    expect(await claim(r2)).toBeNull(); // a newer version of the same week's report is not emailed again
  });
  it('a failed send can be retried once, then is done', async () => {
    const id = await claim('aaaaaaaa-0000-0000-0000-000000000003', '2026-10-15T18:30:00.000Z');
    await pg.query(MARK_FAILED_SQL, [id, 'Resend: timeout']);
    const retry = await claim('aaaaaaaa-0000-0000-0000-000000000003', '2026-10-15T18:30:00.000Z');
    expect(retry).toBe(id);
    await pg.query(MARK_SENT_SQL, [retry]);
    expect(await claim('aaaaaaaa-0000-0000-0000-000000000003', '2026-10-15T18:30:00.000Z')).toBeNull();
  });
});
