/**
 * End-to-end pipeline test against a real Postgres database (same SQL that runs on Neon).
 * Only the outside world is faked: community APIs and Gemini. Run with:
 *   TEST_DATABASE_URL=postgres://... npm run test:integration
 */
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RawDiscussion } from '@/lib/sources/types';
import { reportWindows } from '@/lib/windows';

const URL_ = process.env.TEST_DATABASE_URL;
const HOUR = 3_600_000, DAY = 24 * HOUR;
const w = reportWindows(new Date(), 330);
const cur = (h: number) => new Date(w.currentStart.getTime() + DAY + h * HOUR);
const prev = (h: number) => new Date(w.previousStart.getTime() + DAY + h * HOUR);

function item(sourceId: 'hackernews' | 'stackoverflow', id: string, title: string, body: string, at: Date): RawDiscussion {
  return { sourceId, externalId: id, url: `https://example.test/${sourceId}/${id}`, title, body, author: 'someone', createdAt: at, lastActivityAt: at, score: 3, commentCount: 4, tags: [], meta: { test: true } };
}
const H = {
  h1: item('hackernews', 'h1', 'Review bot noise is killing our code review', 'Our code review bot leaves forty comments per PR and maybe two are real so everyone ignores it.', cur(1)),
  h2: item('hackernews', 'h2', 'Ask HN: code review bots and false positives', 'We turned off the code review bot because of false positives, it flagged valid code constantly and nobody trusted it.', cur(2)),
  h3: item('hackernews', 'h3', 'Code review bot nitpicks everything', 'The code review bot nitpicks formatting all day long and the team mutes it entirely.', prev(1)),
  h4: item('hackernews', 'h4', 'Show HN: my weekend game', 'A small puzzle game written in Rust.', cur(3)),
  h5: item('hackernews', 'h5', 'How do you speed up code review turnaround?', 'Our code review queue takes three days before anyone looks at a pull request.', cur(4)),
  h6: item('hackernews', 'h6', 'Static analysis false positives in CI', 'The static analysis step reports false positives on every build and blocks merges for hours.', cur(5)),
  h7: item('hackernews', 'h7', 'Flaky tests block our merges', 'Flaky tests block merges every day and retries hide real failures from us.', prev(2)),
  h8: item('hackernews', 'h8', 'Flaky tests are eating our week', 'Flaky tests make every deploy a coin toss and nobody owns fixing them.', prev(3)),
};
const S = {
  s1: item('stackoverflow', 's1', 'How do you speed up code review turnaround?', 'Our code review queue takes three days before anyone looks at a pull request.', cur(5)), // cross-post of h5
  s2: item('stackoverflow', 's2', 'Crash in review plugin v2.3', 'The code review plugin crashes with NullPointerException on startup in my setup.', cur(6)),
  s3: item('stackoverflow', 's3', 'How do I configure code review rules?', 'How do I configure code review rules for my repository?', cur(7)),
};

vi.mock('@/lib/sources', () => ({
  ADAPTERS: {
    hackernews: { id: 'hackernews', isAvailable: () => true, search: async (term: string) =>
      term === 'code review' ? [H.h1, H.h2, H.h3, H.h4, H.h5] : term === 'false positives' ? [H.h2, H.h6] : term === 'flaky tests' ? [H.h7, H.h8] : [] },
    stackoverflow: { id: 'stackoverflow', isAvailable: () => true, search: async (term: string) => {
      if (term === 'flaky tests') throw new Error('HTTP 429 from api.stackexchange.com: throttled');
      return term === 'code review' ? [S.s1, S.s2, S.s3] : [];
    } },
    github: { id: 'github', isAvailable: () => false, search: async () => [] },
  },
}));

const calls = { analysis: 0, synthesis: 0 };
vi.mock('@/lib/gemini', () => ({
  geminiJson: async ({ system, user }: { system: string; user: string }) => {
    if (system.includes('Friday Morning Brief')) {
      calls.synthesis++;
      const ids = [...user.matchAll(/<evidence id="([^"]+)"/g)].map((m) => m[1]);
      return {
        headline: 'Review-bot noise is the loudest complaint this week.',
        findings: [
          { title: 'Teams mute noisy bots', insight: 'Several threads describe ignoring bot comments.', pain_point_keys: ['review-bot-false-positives'], evidence_ids: [ids[0]] },
          { title: 'Invented claim', insight: 'Cites nothing real.', pain_point_keys: ['review-bot-false-positives'], evidence_ids: ['not-a-real-id'] },
        ],
        underserved: [{ pain_point_key: 'review-bot-false-positives', why: 'Mostly unresolved.', evidence_ids: [ids[0]] }],
        investigate: [{ recommendation: 'Ask prospects how many bot comments they act on', rationale: 'Noise objection.', pain_point_keys: ['review-bot-false-positives'], evidence_ids: [ids[0]] }],
        caveats: ['Small sample.'],
      };
    }
    calls.analysis++;
    if (calls.analysis === 1) throw new Error('Gemini returned malformed JSON: Sure! Here is'); // first batch fails, then retried
    const items = [...user.matchAll(/<discussion ref="(d\d+)"[^>]*>\nTITLE: (.*)\nTEXT: ([\s\S]*?)\n<\/discussion>/g)].map(([, ref, title, text]) => {
      const verbatim = text.split(' ').slice(0, 10).join(' ');
      const base = { ref, is_relevant: true, resolution_status: 'unresolved', confidence: 0.8, evidence_quote: verbatim, tools_mentioned: [] as string[] };
      if (/Static analysis/.test(title)) return { ...base, kind: 'workflow_pain', pain_point_key: 'Review Bot False Positives', pain_point_label: 'Review bots flag false positives', topic_slug: 'automated-review', evidence_quote: 'these tools are total garbage and useless honestly' };
      if (/bot/i.test(title)) return { ...base, kind: 'workflow_pain', pain_point_key: 'Review Bot False Positives', pain_point_label: 'Review bots flag false positives', topic_slug: 'automated-review', resolution_status: /nitpicks/.test(title) ? 'resolved' : 'unresolved' };
      if (/turnaround/.test(title)) return { ...base, kind: 'workflow_pain', pain_point_key: 'pr-review-latency', pain_point_label: 'Slow PR review', topic_slug: 'code-review' };
      if (/Flaky/.test(title)) return { ...base, kind: 'workflow_pain', pain_point_key: 'flaky-tests-block-merges', pain_point_label: 'Flaky tests block merges', topic_slug: 'ci-cd' };
      if (/Crash/.test(title)) return { ...base, kind: 'isolated_bug', pain_point_key: 'review-plugin-crash', pain_point_label: 'Review plugin crash', topic_slug: 'not-a-topic' };
      if (/How do I/.test(title)) return { ...base, kind: 'how_to_question', pain_point_key: null };
      return { ...base, is_relevant: false, kind: 'not_relevant', pain_point_key: null };
    });
    return { items };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

describe.skipIf(!URL_)('pipeline on Postgres', () => {
  let sql: import('postgres').Sql;
  let runPipeline: typeof import('@/lib/pipeline/run').runPipeline;
  let queries: typeof import('@/lib/queries');
  let closeDb: () => Promise<void>;
  let firstReportId = '';

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: URL_, GEMINI_API_KEY: 'test', GEMINI_MIN_INTERVAL_MS: '0', CRON_SECRET: 'x', DASHBOARD_PASSWORD: 'x', REPORT_TZ_OFFSET_MINUTES: '330' });
    const { default: postgres } = await import('postgres');
    const { normalizeDatabaseUrl } = await import('@/lib/dburl');
    const admin = postgres(normalizeDatabaseUrl(URL_!), { max: 1, onnotice: () => {} });
    await admin.unsafe('drop schema public cascade; create schema public;');
    await admin.end();
    execSync('node scripts/migrate.mjs', { env: { ...process.env, DATABASE_URL: URL_ }, stdio: 'pipe' });
    ({ runPipeline } = await import('@/lib/pipeline/run'));
    queries = await import('@/lib/queries');
    const dbm = await import('@/lib/db');
    sql = dbm.db(); closeDb = dbm.closeDb;
  }, 60_000);
  afterAll(async () => { await closeDb?.(); });

  it('collects, analyzes and reports with deterministic numbers', async () => {
    const res = await runPipeline('manual', 'full');
    expect(res.status).toBe('partial'); // Stack Overflow failed one keyword
    const c = (res as unknown as { stats: { collect: { newDiscussions: number; duplicatesFlagged: number; droppedNoMatch: number; sources: Record<string, { failures: number }> } } }).stats.collect;
    expect(c.newDiscussions).toBe(10); // h1..h8 minus h4 (no phrase) = 7 HN, + 3 SO
    expect(c.droppedNoMatch).toBe(1);
    expect(c.duplicatesFlagged).toBe(1); // s1 is a cross-post of h5
    expect(c.sources.stackoverflow.failures).toBe(1);
    expect(calls.analysis).toBe(2); // malformed batch retried successfully

    const report = (await queries.getReport())!;
    firstReportId = report.id;
    expect(report.totals).toMatchObject({
      discussions_collected: 6, discussions_analyzed: 6, relevant_discussions: 6,
      pain_discussions: 4, pain_discussions_previous: 3, keyword_mentions: 13, duplicates_excluded: 1,
      rising: 1, new: 1,
    });
    const m = Object.fromEntries((await queries.getMetrics(report.id)).map((x) => [x.pain_point_key, x]));
    expect(m['review-bot-false-positives']).toMatchObject({ current_count: 3, previous_count: 1, abs_change: 2, pct_change: 200, trend: 'rising', distinct_sources: 1, unresolved_count: 3, underserved: true, verified_share: 0.67, sufficiency: 'limited' });
    expect(m['pr-review-latency']).toMatchObject({ current_count: 1, previous_count: 0, pct_change: null, trend: 'new' });
    expect(m['flaky-tests-block-merges']).toMatchObject({ current_count: 0, previous_count: 2, trend: 'gone' });
    expect(m['review-plugin-crash']).toMatchObject({ current_count: 0, bug_reports: 1 });
    expect(typeof m['review-bot-false-positives'].avg_confidence).toBe('number');
    expect(m['review-bot-false-positives'].evidence.find((e) => e.title.startsWith('Static'))?.quote).toBeNull(); // invented quote hidden

    expect(report.synthesis?.findings).toHaveLength(1); // uncited claim removed
    expect(report.synthesis?.dropped_unsupported).toBe(1);
    expect(report.data_quality.source_health.stackoverflow.failed_requests).toBe(1);
    expect(report.data_quality.has_previous_report).toBe(false);
    expect(typeof report.generated_at).toBe('string');

    const [{ n }] = await sql`select count(*)::int as n from keywords where backfilled_at is null`;
    expect(n).toBe(1); // 'flaky tests' failed on SO, so it will be backfilled again next run
    const [run] = await sql`select status, stats from collection_runs where id = ${res.runId}`;
    expect(run.status).toBe('partial');
  }, 60_000);

  it('is idempotent: re-collecting adds nothing and does not re-analyze', async () => {
    const before = calls.analysis;
    const res = await runPipeline('cron_weekly', 'full');
    const st = (res as unknown as { stats: { collect: { newDiscussions: number }; analyze: { analyzed: number } } }).stats;
    expect(st.collect.newDiscussions).toBe(0);
    expect(st.analyze.analyzed).toBe(0);
    expect(calls.analysis).toBe(before);
    const [{ n }] = await sql`select count(*)::int as n from discussions`;
    expect(n).toBe(10);
    const reports = await sql`select version, trigger from reports order by version`;
    expect(reports.map((r) => `${r.version}:${r.trigger}`)).toEqual(['1:manual', '2:cron_weekly']);
    // Second scheduled run for the same week must not create another report
    await runPipeline('cron_weekly', 'full');
    const [{ r }] = await sql`select count(*)::int as r from reports`;
    expect(r).toBe(2);
    // Snapshots are immutable: the first report still has its own metrics
    expect((await queries.getMetrics(firstReportId)).length).toBe(4);
  }, 60_000);

  it('refuses to start while another run is in progress', async () => {
    await sql`insert into collection_runs (trigger, mode) values ('manual', 'full')`;
    const res = await runPipeline('manual', 'collect');
    expect(res.status).toBe('skipped');
    await sql`update collection_runs set status = 'failed' where status = 'running'`;
  });

  it('manages keywords from the UI actions without code changes', async () => {
    const { addKeyword, addTopic } = await import('@/app/topics/actions');
    const [t] = await sql`select id from topics where slug = 'code-review'`;
    const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
    expect((await addKeyword(null, fd({ topicId: t.id, term: 'reviewer burnout' })))?.ok).toBe(true);
    expect(await addKeyword(null, fd({ topicId: t.id, term: 'Reviewer Burnout' }))).toEqual({ ok: false, message: 'This keyword already exists in the topic' });
    expect((await addKeyword(null, fd({ topicId: 'nope', term: 'x y' })))?.ok).toBe(false);
    expect((await addTopic(null, fd({ name: 'Monorepo tooling' })))?.ok).toBe(true);
    expect((await addTopic(null, fd({ name: 'monorepo tooling' })))?.message).toBe('A topic with this name already exists');
    const { loadConfig } = await import('@/lib/pipeline/config');
    expect((await loadConfig()).keywords.some((k) => k.term === 'reviewer burnout' && k.backfilled_at === null)).toBe(true);
  });

  it('serves weekly history for a pain point', async () => {
    const { GET } = await import('@/app/api/pain-points/[key]/route');
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ key: 'review-bot-false-positives' }) });
    const body = await res.json();
    expect(body.history).toHaveLength(1); // latest version per week
    expect(body.history[0].count).toBe(3);
    const bad = await GET(new Request('http://x'), { params: Promise.resolve({ key: '../etc' }) });
    expect(bad.status).toBe(400);
  });
});
