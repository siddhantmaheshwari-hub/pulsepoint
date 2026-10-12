/**
 * Regression tests for issues found during Phase 1 live verification (see docs/LIVE_VERIFICATION.md).
 * Response shapes were captured from the real APIs on 2026-10-12; authors, text and URLs are replaced.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeadlineError, fetchJson, HttpError } from '@/lib/http';
import { isTransient } from '@/lib/pipeline/analyze';
import { hackerNews } from '@/lib/sources/hackernews';
import { stackOverflow } from '@/lib/sources/stackoverflow';
import { analysisBatchSchema, analysisItemSchema, cleanAnalysis, validateSynthesis } from '@/lib/schemas';
import { phraseQuery } from '@/lib/text';

// Gemini's real overload response (status 503) for gemini-3.8-flash.
const GEMINI_503 = { error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', status: 'UNAVAILABLE' } };

// Algolia HN search_by_date: comment hits carry story_id/story_title and no title/points/num_comments.
const ALGOLIA_PAGE = {
  nbPages: 1,
  hits: [
    { _tags: ['comment', 'author_user1', 'story_1001'], author: 'user1', comment_text: 'Our <i>code review</i> queue is three days deep.', created_at_i: 1791818161, objectID: '2001', parent_id: 1001, story_id: 1001, story_title: 'Ask HN: How do you keep code review fast?', story_url: null },
    { _tags: ['comment', 'author_user2', 'story_1001'], author: 'user2', comment_text: 'We split PRs so code review takes minutes.', created_at_i: 1791817000, objectID: '2002', parent_id: 1001, story_id: 1001, story_title: 'Ask HN: How do you keep code review fast?', story_url: null },
    { _tags: ['story', 'author_user3', 'story_1002'], author: 'user3', title: 'Show HN: A code-review bot that stays quiet', url: 'https://example.test/bot', story_text: null, created_at_i: 1791816556, objectID: '1002', points: 12, num_comments: 4 },
  ],
};

// Stack Exchange /search/advanced with filter=withbody (no key): note quota fields and HTML-encoded titles.
const SE_PAGE = {
  items: [{ tags: ['github-actions'], owner: { display_name: 'user4' }, is_answered: false, view_count: 31, answer_count: 0, score: 0, last_activity_date: 1791800000, creation_date: 1791800000, question_id: 3001, content_license: 'CC BY-SA 4.0', link: 'https://stackoverflow.com/questions/3001/x', title: 'Static analysis step &quot;fails&quot; on every PR', body: '<p>Our static analysis step fails on every PR.</p>' }],
  has_more: false, quota_max: 300, quota_remaining: 281,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fetchJson deadline (run took 464 s against a 240 s budget)', () => {
  it('stops retrying a persistent 503 once the next backoff would cross the deadline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => json(GEMINI_503, 503));
    vi.stubGlobal('fetch', fetchMock);
    const t0 = Date.now();
    const err = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', { retries: 3, timeoutMs: 60_000, deadline: Date.now() + 3_500 }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(3_500);
    expect(fetchMock.mock.calls.length).toBeLessThan(4); // without a deadline it would make all 4 attempts
  });

  it('refuses to start a request when the budget is already spent', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://hn.algolia.com/api/v1/search', { deadline: Date.now() + 500 })).rejects.toBeInstanceOf(DeadlineError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cuts off a request that never answers, says so plainly, and treats it as transient', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Seen live: Gemini accepted a request and sent nothing back for 8+ minutes.
    const stall = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')))));
    vi.stubGlobal('fetch', stall);
    const err = await fetchJson('https://generativelanguage.googleapis.com/x', { retries: 0, timeoutMs: 300 }).catch((e) => e);
    expect((err as Error).message).toBe('No response from generativelanguage.googleapis.com within 0 s');
    expect(isTransient(err)).toBe(true);
  });

  it('still retries transient failures when time allows', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValueOnce(json(GEMINI_503, 503)).mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.test/x', { deadline: Date.now() + 30_000 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('isTransient (outages must not burn a discussion\'s analysis attempts)', () => {
  it('treats overload, rate limits, timeouts and dropped Neon connections as transient', () => {
    expect(isTransient(new HttpError(503, JSON.stringify(GEMINI_503)))).toBe(true);
    expect(isTransient(new HttpError(429, 'quota'))).toBe(true);
    expect(isTransient(new DeadlineError('budget'))).toBe(true);
    // postgres.js error seen live: "write CONNECTION_CLOSED ep-…-pooler…neon.tech:5432"
    expect(isTransient(Object.assign(new Error('write CONNECTION_CLOSED host:5432'), { code: 'CONNECTION_CLOSED' }))).toBe(true);
    expect(isTransient(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
  });
  it('treats unusable model output and config errors as real failures', () => {
    expect(isTransient(new Error('Gemini returned malformed JSON: {'))).toBe(false);
    expect(isTransient(new HttpError(400, 'bad schema'))).toBe(false);
    expect(isTransient(new HttpError(404, 'model gemini-2.5-flash is no longer available'))).toBe(false);
  });
});

describe('overlong model fields are trimmed, not fatal (one 11-tool answer failed a whole batch twice)', () => {
  const item = { ref: 'd1', is_relevant: true, kind: 'workflow_pain', resolution_status: 'unresolved', confidence: 0.8, evidence_quote: null };
  it('keeps the batch and trims tools_mentioned to 10', () => {
    const tools = Array.from({ length: 11 }, (_, i) => `tool-${i}`);
    const parsed = analysisBatchSchema.parse({ items: [{ ...item, tools_mentioned: tools }] });
    expect(parsed.items[0].tools_mentioned).toHaveLength(10);
  });
  it('clamps confidence and still rejects genuinely malformed output', () => {
    expect(analysisBatchSchema.parse({ items: [{ ...item, confidence: 1.2 }] }).items[0].confidence).toBe(1);
    expect(analysisBatchSchema.safeParse({ items: [{ ...item, kind: 'angry' }] }).success).toBe(false);
  });
  it('verifies a long quote verbatim before truncating it', () => {
    const words = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
    const c = cleanAnalysis(analysisItemSchema.parse({ ...item, evidence_quote: words }), `TITLE\n${words}`, new Set());
    expect(c.evidence_verified).toBe(true);
    expect(c.evidence_quote!.length).toBeLessThanOrEqual(400);
  });
  it('slices extra synthesis findings instead of discarding the whole brief', () => {
    const f = (i: number) => ({ title: `T${i}`.padEnd(200, '.'), insight: 'x', pain_point_keys: ['k'], evidence_ids: ['e1'] });
    const s = validateSynthesis({ headline: 'H', findings: Array.from({ length: 9 }, (_, i) => f(i)), underserved: [], investigate: [], caveats: [] }, new Set(['e1']), new Set(['k']));
    expect(s.findings).toHaveLength(8);
    expect(s.findings[0].title.length).toBeLessThanOrEqual(140);
  });
});

describe('phrase queries (200 of 279 fetched HN items failed the exact-phrase check)', () => {
  it('quotes multi-word terms and leaves single words alone', () => {
    expect(phraseQuery('code review')).toBe('"code review"');
    expect(phraseQuery('  flaky   tests ')).toBe('"flaky tests"');
    expect(phraseQuery('monorepo')).toBe('monorepo');
    expect(phraseQuery('say "hi" there')).toBe('"say hi there"');
  });

  it('Hacker News adapter sends the quoted phrase and folds comments into their thread', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return json(ALGOLIA_PAGE); }));
    const out = await hackerNews.search('code review', new Date(Date.now() - 86_400_000), 100, Date.now() + 30_000);
    expect(new URL(urls[0]).searchParams.get('query')).toBe('"code review"');
    expect(out).toHaveLength(2);
    const thread = out.find((d) => d.externalId === '1001')!;
    expect(thread.title).toBe('Ask HN: How do you keep code review fast?');
    expect(thread.body).toContain('three days deep');
    expect(thread.body).toContain('takes minutes');
    expect(thread.body).not.toContain('<i>');
    expect(out.find((d) => d.externalId === '1002')!.score).toBe(12);
  });

  it('Stack Overflow adapter sends the quoted phrase and decodes the real response shape', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return json(SE_PAGE); }));
    const out = await stackOverflow.search('static analysis', new Date(Date.now() - 86_400_000), 25, Date.now() + 30_000);
    expect(new URL(urls[0]).searchParams.get('q')).toBe('"static analysis"');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Static analysis step "fails" on every PR');
    expect(out[0].body).toBe('Our static analysis step fails on every PR.');
    expect(out[0].meta).toMatchObject({ is_answered: false, has_accepted_answer: false });
  });
});
