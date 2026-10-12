# Live verification (Phase 1)

**Date:** 12 Oct 2026 · **Environment:** local `next dev` on Windows 11 → real Neon Postgres (pooled), real Hacker News Algolia API, real Stack Exchange API (no key), real Gemini API.
Everything below was run, not assumed. Numbers are copied from the database and run logs.

## What ran

| Step | Result |
|---|---|
| `npm run db:migrate` against Neon | 10 tables + `schema_migrations`; 13 seed keywords across 4 topics |
| Live runs through `POST /api/runs` (same endpoint as Generate report) | 11 runs: collect, analyze, report and full modes |
| Re-analysis after prompt change (`a1` → `a2`) | All 160 discussions re-analysed; 0 permanently failed |
| Latest full run | `succeeded` in **40 s** (collect 13 s, analyze 2 s, report 19 s), AI synthesis present, 0 errors |
| Unit tests | 48 passed |
| Integration tests (full pipeline SQL on a throwaway in-memory Postgres via PGlite) | 7 passed |
| Type-check, lint | clean |

## Real counts (report for 5–11 Oct 2026, version 5)

- Discussions stored: **160** unique (15-day backfill), 1 cross-post excluded.
- This week: **78** discussions collected and analysed (100% coverage), **130** keyword mentions, **37** relevant.
- **8** pain discussions this week across **5** pain points (11 the week before).
- Classification mix (analysis `a2`, all 160): not relevant 77 · opinion 58 · workflow pain 20 · how-to 3 · isolated bug 2.
- Relevant pain per week: **≈10**. Nine Checks #3 asked for ~20/week before trusting trends, so trends are tentative; every pain point is labelled limited or insufficient data.
- Source yield (15 days): Hacker News 199 phrase matches; **Stack Overflow 2**.

## Issues found and fixed

Each fix has a regression test (`tests/live-regressions.test.ts`, `tests/integration/pipeline.test.ts`) using response shapes captured from the live APIs, with personal data removed.

| # | Reality | Fix |
|---|---|---|
| 1 | `npm run db:migrate` failed on Windows (`C:\C:\…` path from `URL.pathname`) and needed `DATABASE_URL` exported by hand | `fileURLToPath`; reads `.env.local` when the variable isn't set |
| 2 | `gemini-2.5-flash` returns **404 "no longer available to new users"** | Default model `gemini-3.8-flash` (verified to accept the uppercase-type, nullable and enum `responseSchema`) |
| 3 | First full run took **464 s** against a 240 s budget (Vercel kills at 300 s). Gemini returns intermittent **503 "high demand"**; each call could retry for ~4 min unbounded | `fetchJson` takes a hard `deadline`: timeouts are capped by it and no retry starts past it. Threaded through Gemini, analysis, synthesis and all source adapters |
| 4 | Gemini sometimes **accepts a request and never answers** (one probe hung 8+ min) | Per-attempt timeout 60 → 40 s (healthy calls take 10–15 s); clear "No response from … within N s" error; timeout retries logged |
| 5 | Neon pooler dropped connections (`CONNECTION_CLOSED` once, `ECONNRESET` twice) | `keep_alive: 30`, `max_lifetime: 300`; dropped connections are classified transient (see 6) |
| 6 | Outages consumed a discussion's 3 analysis attempts → discussions could be silently never analysed | `isTransient()`: overload, rate limit, timeout, deadline and dropped connections leave the batch pending without spending an attempt; only unusable model output costs one |
| 7 | `analyzed` was counted before the batch transaction committed (run reported 60 analysed, 50 stored) | Counters update only after commit |
| 8 | Unquoted search queries: **200 of 279** fetched HN items failed the exact-phrase check, wasting the 25-item cap | Multi-word terms are sent quoted to Algolia and Stack Exchange (`phraseQuery`); drops fell to 6 |
| 9 | A one-shot capped 15-day backfill undercounts last week vs daily-collected weeks → **false "rising" trends** on busy keywords | Migration `0003`: HN cap 25 → 100 (adapter maximum); keywords that hit the cap are recorded in run stats (`capped`) |
| 10 | One answer listing 11 tools failed a **whole batch of 10** twice (zod `max(10)`); same risk in synthesis | Length limits trim instead of reject; wrong types / unknown enums still reject; quotes verified before truncation |
| 11 | A run stayed **"running" forever** in System health and a second pipeline started beside it | Stale runs (> 6 min) are closed as `failed` with an honest message before the guard; a watchdog records an outcome before 290 s whatever hangs; stage start/finish logged. The observed hang coincided with hot-reloading modules the run was using (dev-only), but the guards hold regardless |
| 12 | Brief's volume chart and "Where pain is surfacing" went **blank / disagreed with the brief** after a prompt change | They read the report's own `analysis_version`, keeping the snapshot consistent |
| 13 | Weeks before monitoring began rendered as small bars (read as zero) | Hatched "Not monitored yet" gaps, per DESIGN.md ("a gap, not a zero") |
| 14 | The focal dark panel featured a **single new anecdote** over the 4-discussion lead problem | A rising/new item needs non-insufficient data to lead; otherwise "Most discussed this week" in neutral teal |
| 15 | Prompt-version bump left nothing to re-analyse, so the next brief would be empty | `analyzePending` re-queues the last 56 days lacking an analysis for the current version |

## Classifier quality check (15 random discussions, read by hand)

- **12 of 15** agree with my reading. I'd change 3: #8 (visual-diff tests producing false positives in CI) is workflow pain, not opinion; #6 and #15 are opinion, not "not relevant". Only #8 would change a count.
- Most noise comes from generic keywords matching HN comments in unrelated threads: "false positives" matched 61 threads, 3 were pain (spam filters, Bloom filters, ML); "build times" and "developer productivity" had 0 relevant hits.
- **Key fragmentation:** moderate under `a1` (three keys for "AI review tools are noisy/unreliable", several over-specific one-offs). The `a2` prompt (problem-level keys; judge the comment, not the thread) consolidated the noise cluster from 2 to 4 discussions; `agent-review-comment-moderation` remains separate. Further prompt tuning has diminishing returns; key merging (Phase 3 taxonomy management) is the structural fix.

## Layout with real data

Checked at 1440 px and 390 px on all nine pages. No horizontal overflow at 390 px. Long headlines wrap within 26ch; long evidence titles truncate with an ellipsis and keep the screen-reader suffix; one-week history renders sparklines as "—" without breaking; empty Stack Overflow rows show 0/0 with a neutral tag.

## Remaining concerns

1. **Volume is low** (~10 pain discussions/week). Trends will stay tentative until more sources or keywords are added.
2. **Stack Overflow is nearly empty** in 2026 (545 new questions site-wide in 15 days). Recommend GitHub Issues (needs `GITHUB_TOKEN`) or another community Sumit actually reads.
3. **Keyword noise:** "false positives", "build times", "developer productivity" should be narrowed (e.g. "false positive rate", "review bot") — Sumit's call; topics are editable without a deploy.
4. **Gemini reliability:** intermittent 503s and silent stalls make run times vary (40–245 s). Bounded now; a run that runs out of budget leaves the rest queued for the next run.
5. **Not yet verified:** Vercel deployment and crons (Phase 2), and the Stack Exchange `backoff` field (never returned during testing).
6. Accidental incident during testing: an integration test run connected to another local project's PGlite database on port 54329 (the throwaway server failed to bind) and dropped its schema. Production Neon was untouched. The test database now uses port 55433 and is started with `npm run test:db`; always confirm the listener is the process you started.
