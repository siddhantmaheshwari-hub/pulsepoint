/**
 * LOCAL VISUAL QA ONLY — fills a throwaway Postgres database with 8 simulated weeks by running the
 * real pipeline with faked community APIs and a faked Gemini. Never run against production.
 *   SEED_VISUAL_DB=postgres://… npx vitest run tests/fixtures/visual-seed.test.ts
 */
import { execSync } from 'node:child_process';
import { describe, it, vi } from 'vitest';
import type { RawDiscussion } from '@/lib/sources/types';

const URL_ = process.env.SEED_VISUAL_DB;
const DAY = 86_400_000;

type P = { key: string; label: string; topic: string; terms: string[]; counts: number[]; titles: string[]; status: string[]; workaround?: string };
const PAINS: P[] = [
  { key: 'review-bot-false-positives', label: 'Review bots flag too many false positives', topic: 'automated-review', terms: ['false positives', 'static analysis', 'AI code review'], counts: [1, 1, 2, 2, 3, 3, 4, 11], status: ['unresolved', 'unresolved', 'partially_resolved'], workaround: 'Muting bot comments on draft PRs',
    titles: ['Our review bot leaves 40 comments per PR', 'How do you tune static analysis noise?', 'Turned off the AI reviewer after two sprints', 'Linters drowning real review feedback', 'Bot comments make reviewers skip everything', 'Anyone measuring review bot precision?'] },
  { key: 'pr-review-latency', label: 'Pull requests wait days for a first review', topic: 'code-review', terms: ['code review', 'PR review'], counts: [4, 5, 5, 6, 5, 6, 7, 6], status: ['unresolved', 'partially_resolved'], workaround: 'Rotating reviewer of the day',
    titles: ['Median time to first review is three days', 'How do small teams keep PR review under a day?', 'Review queue is our real bottleneck', 'Nobody owns the review queue'] },
  { key: 'flaky-tests-block-merges', label: 'Flaky tests block merges', topic: 'ci-cd', terms: ['flaky tests'], counts: [6, 7, 8, 8, 9, 10, 11, 6], status: ['partially_resolved', 'unresolved', 'resolved'], workaround: 'Quarantine list for known flaky tests',
    titles: ['Retries hide real failures in CI', 'Flaky tests make every merge a coin toss', 'How we quarantined flaky tests', 'Flaky end-to-end suite blocks releases'] },
  { key: 'large-pr-rubber-stamping', label: 'Large PRs get rubber-stamped', topic: 'code-review', terms: ['code review'], counts: [1, 2, 1, 2, 1, 2, 2, 4], status: ['unresolved'], workaround: 'Soft size limit in the PR template',
    titles: ['Nobody really reviews 2,000-line PRs', 'Big diffs get approved without reading', 'Splitting PRs is harder than it sounds'] },
  { key: 'slow-ci-feedback', label: 'Slow CI builds stall review feedback', topic: 'ci-cd', terms: ['CI pipeline', 'build times'], counts: [3, 3, 4, 5, 4, 5, 5, 5], status: ['resolved', 'partially_resolved'], workaround: 'Test sharding',
    titles: ['Pipeline takes 40 minutes before reviewers look', 'Cutting build times in a monorepo', 'Reviewers wait for the CI pipeline to go green'] },
  { key: 'ai-review-trust', label: 'Teams don’t trust AI review comments', topic: 'automated-review', terms: ['AI code review'], counts: [0, 0, 0, 0, 0, 0, 0, 5], status: ['unresolved'],
    titles: ['Do you act on AI code review suggestions?', 'AI reviewer is confidently wrong about our conventions', 'Half the AI code review comments are noise'] },
  { key: 'stacked-pr-tooling', label: 'No good tooling for stacked PRs', topic: 'dev-workflow', terms: ['stacked PRs'], counts: [0, 0, 1, 1, 1, 2, 2, 3], status: ['unresolved'], workaround: 'Manual rebase scripts',
    titles: ['Is anyone happy with stacked PRs?', 'Rebasing a stack after one comment', 'Stacked PRs on GitHub without extra tools'] },
  { key: 'merge-queue-cost', label: 'Merge queues add cost and delay', topic: 'ci-cd', terms: ['merge queue'], counts: [1, 1, 1, 2, 1, 2, 2, 0], status: ['partially_resolved'],
    titles: ['Is a merge queue worth the CI bill?', 'Merge queue doubled our wait time'] },
  { key: 'missing-change-context', label: 'Reviewers lack context on why a change exists', topic: 'code-review', terms: ['pull request review'], counts: [1, 0, 1, 1, 0, 1, 1, 2], status: ['unresolved'], workaround: 'Ticket link required in template',
    titles: ['Reviewers keep asking why in pull request review', 'PR descriptions nobody writes'] },
];
const NOISE = [
  { kind: 'how_to_question', term: 'code review', title: 'How do I require code review approval on main?' },
  { kind: 'how_to_question', term: 'CI pipeline', title: 'How to cache node_modules in a CI pipeline' },
  { kind: 'not_relevant', term: 'developer productivity', title: 'Show HN: a tiny habit tracker for developer productivity' },
  { kind: 'isolated_bug', term: 'static analysis', title: 'Static analysis plugin crashes on startup', key: 'review-bot-false-positives' },
  { kind: 'opinion', term: 'code review', title: 'Code review culture is about trust, not tools' },
];

function bodyFor(term: string, title: string, i: number, uniq = '') {
  const tails = ['and the whole team just ignores it now, which defeats the purpose of having it.', 'so we end up waiting most of the week before anything merges.', 'and every workaround we tried only moved the problem somewhere else.', 'which nobody on our 40-person team feels they own.'];
  return `${uniq}We keep running into this with ${term} on a mid-size team: ${title.toLowerCase()}, ${tails[i % tails.length]}`;
}

const classify = new Map<string, Record<string, unknown>>();
function weekItems(endMs: number, w: number): (RawDiscussion & { term: string })[] {
  const out: (RawDiscussion & { term: string })[] = [];
  PAINS.forEach((p, pi) => {
    for (let i = 0; i < p.counts[w]; i++) {
      const term = p.terms[i % p.terms.length], src = (i + pi) % 3 === 2 ? 'stackoverflow' : 'hackernews';
      const title = `${p.titles[(i + w) % p.titles.length]}${i >= p.titles.length ? ` (${['monorepo', 'Rails app', 'Go services', 'iOS team', 'data platform', 'fintech', 'agency'][(i + w) % 7]})` : ''}`;
      const body = bodyFor(term, title, i + w, `Team of ${12 + ((i * 17 + w * 29 + pi * 7) % 180)} engineers, week ${w + 1}. `);
      const at = new Date(endMs - DAY * 7 + ((i * 37 + pi * 11) % 160) * 3_600_000 + 60_000 * (w + 1));
      out.push({ term, sourceId: src as 'hackernews' | 'stackoverflow', externalId: `w${w}-${p.key}-${i}`, url: `https://example.test/${src}/w${w}-${p.key}-${i}`, title, body, author: 'dev', createdAt: at, lastActivityAt: at, score: 5 + ((i * 7) % 40), commentCount: 3 + ((i * 5) % 30), tags: [], meta: {} });
      classify.set(title + '|' + at.toISOString(), { kind: i % 4 === 3 && p.key !== 'ai-review-trust' ? 'unmet_need' : 'workflow_pain', pain_point_key: p.key, pain_point_label: p.label, topic_slug: p.topic, resolution_status: p.status[i % p.status.length], existing_workaround: p.workaround && i % 2 === 0 ? p.workaround : null, confidence: 0.62 + ((i * 13) % 35) / 100, quote: i % 5 !== 4 });
    }
  });
  NOISE.forEach((n, ni) => {
    const at = new Date(endMs - DAY * 6 + ni * 9 * 3_600_000 + 60_000 * (w + 1));
    const title = `${n.title} (#${w + 1})`;
    out.push({ term: n.term, sourceId: ni % 2 ? 'stackoverflow' : 'hackernews', externalId: `w${w}-noise-${ni}`, url: `https://example.test/n/w${w}-${ni}`, title, body: bodyFor(n.term, title, ni, `Post ${w}-${ni}. `), author: 'dev', createdAt: at, lastActivityAt: at, score: 2, commentCount: 1, tags: [], meta: {} });
    classify.set(title + '|' + at.toISOString(), { kind: n.kind, pain_point_key: n.key ?? null, pain_point_label: n.key ? 'Review bots flag too many false positives' : null, topic_slug: n.key ? 'automated-review' : null, resolution_status: 'unknown', confidence: 0.7, quote: true });
  });
  return out;
}

let current: (RawDiscussion & { term: string })[] = [];
let failSO = false;
vi.mock('@/lib/sources', () => {
  const mk = (id: 'hackernews' | 'stackoverflow') => ({ id, isAvailable: () => true, search: async (term: string) => {
    if (id === 'stackoverflow' && failSO && term === 'flaky tests') throw new Error('HTTP 429 from api.stackexchange.com: throttled');
    return current.filter((d) => d.sourceId === id && d.term === term).map(({ term: _t, ...d }) => d); // eslint-disable-line @typescript-eslint/no-unused-vars
  } });
  return { ADAPTERS: { hackernews: mk('hackernews'), stackoverflow: mk('stackoverflow'), github: { id: 'github', isAvailable: () => false, search: async () => [] } } };
});
vi.mock('@/lib/gemini', () => ({
  geminiJson: async ({ system, user }: { system: string; user: string }) => {
    if (system.includes('Friday Morning Brief')) {
      const pts = [...user.matchAll(/- key=(\S+) label="([^"]+)" topic=\S+ trend=(\w+).*underserved_flag=(\w+)\n((?: {2}<evidence[^\n]*\n?)*)/g)].map((m) => ({ key: m[1], label: m[2], trend: m[3], under: m[4] === 'true', ids: [...m[5].matchAll(/id="([^"]+)"/g)].map((x) => x[1]) }));
      const rising = pts.find((p) => p.trend === 'rising') ?? pts[0], fresh = pts.find((p) => p.trend === 'new'), easing = pts.find((p) => p.trend === 'declining');
      return {
        headline: fresh ? `${rising.label} surged this week, and a new complaint appeared: ${fresh.label.toLowerCase()}.` : `${rising.label} led the week${easing ? `, while ${easing.label.toLowerCase()} eased` : ''}.`,
        findings: [
          { title: 'Noise is the objection, not automation', insight: `Threads about ${rising.label.toLowerCase()} describe teams muting or ignoring automated comments rather than rejecting automated review. The recurring ask is fewer, higher-signal comments.`, pain_point_keys: [rising.key], evidence_ids: rising.ids.slice(0, 2) },
          ...(easing ? [{ title: 'Some pain is easing', insight: `${easing.label} came up less often; several threads describe workarounds that stuck.`, pain_point_keys: [easing.key], evidence_ids: easing.ids.slice(0, 1) }] : []),
        ],
        underserved: pts.filter((p) => p.under).slice(0, 3).map((p) => ({ pain_point_key: p.key, why: `Developers describe ${p.label.toLowerCase()} repeatedly and most threads end without a fix they are happy with; the workarounds mentioned are manual.`, evidence_ids: p.ids.slice(0, 2) })),
        investigate: [
          { recommendation: 'Ask the next three prospects what share of bot comments they act on', rationale: 'The rise is concentrated in review-bot noise, which matches the objection sales hears in demos.', pain_point_keys: [rising.key], evidence_ids: rising.ids.slice(0, 1) },
          ...(fresh ? [{ recommendation: `Interview one team that described ${fresh.label.toLowerCase()}`, rationale: 'Newly observed this week with a single source; treat it as a lead until it recurs.', pain_point_keys: [fresh.key], evidence_ids: fresh.ids.slice(0, 1) }] : []),
        ],
        caveats: ['Stack Overflow skews toward how-to questions, so its share of pain is naturally lower.'],
      };
    }
    const items = [...user.matchAll(/<discussion ref="(d\d+)"[^>]*>\nTITLE: (.*)\nTEXT: ([\s\S]*?)\n<\/discussion>/g)].map(([, ref, title, text]) => {
      const c = [...classify.entries()].find(([k]) => k.startsWith(title + '|'))?.[1] ?? { kind: 'not_relevant', resolution_status: 'unknown', confidence: 0.5 };
      const quote = c.quote ? text.split(' ').slice(4, 20).join(' ') : 'this tool is honestly the worst thing that ever happened to us';
      return { ref, is_relevant: c.kind !== 'not_relevant', kind: c.kind, pain_point_key: c.pain_point_key ?? null, pain_point_label: c.pain_point_label ?? null, topic_slug: c.topic_slug ?? null, resolution_status: c.resolution_status, existing_workaround: c.existing_workaround ?? null, evidence_quote: quote, confidence: c.confidence, tools_mentioned: [] };
    });
    return { items };
  },
}));

describe.skipIf(!URL_)('seed visual QA data', () => {
  it('runs the real pipeline over 8 simulated weeks', async () => {
    Object.assign(process.env, { DATABASE_URL: URL_, GEMINI_API_KEY: 'test', GEMINI_MIN_INTERVAL_MS: '0', CRON_SECRET: 'x', DASHBOARD_PASSWORD: 'x', REPORT_TZ_OFFSET_MINUTES: '330' });
    const { default: postgres } = await import('postgres');
    const admin = postgres(URL_!, { max: 1, onnotice: () => {} });
    await admin.unsafe('drop schema public cascade; create schema public;');
    await admin.end();
    execSync('node scripts/migrate.mjs', { env: { ...process.env, DATABASE_URL: URL_ } });
    const { runPipeline } = await import('@/lib/pipeline/run');
    const { reportWindows } = await import('@/lib/windows');
    const { closeDb } = await import('@/lib/db');
    // Last simulated Friday 08:00 IST at or before the real now
    const realEnd = reportWindows(new Date(), 330).currentEnd.getTime();
    let fri = realEnd; while (new Date(fri + 330 * 60_000).getUTCDay() !== 5) fri -= DAY;
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let w = 0; w < 8; w++) {
      const end = fri - (7 - w) * 7 * DAY; // local midnight that ends simulated week w
      current = [...weekItems(end, w), ...(w > 0 ? weekItems(end - 7 * DAY, w - 1) : [])];
      failSO = w === 7;
      vi.setSystemTime(new Date(end + 2.5 * 3_600_000 - 330 * 60_000 + 330 * 60_000));
      const r = await runPipeline('cron_weekly', 'full');
      console.log(`week ${w}: ${r.status}`);
    }
    vi.useRealTimers();
    await closeDb();
  }, 300_000);
});
