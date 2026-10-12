# PulsePoint — Claude Code Build Prompt

> **How to start:** open Claude Code in this `pulse` folder and type:
> `Read PULSEPOINT_BUILD_PROMPT.md and CLAUDE.md, then start with Phase 0.`

---

## 1. Your role

Act as my senior full-stack engineer, data engineer and design engineer. The quality bar is the best SaaS products in the world.

**This is not a fresh build.** A working, tested, redesigned application already exists in this folder. Your job is to:
1. prove it works with **live** data;
2. deploy it;
3. fix whatever reality reveals;
4. add the high-value features in Phase 3.

Preserve what works. Do not rewrite working modules, and do not restyle screens away from the design system.

Work through the phases in order. Make routine technical decisions yourself and explain important trade-offs in one or two sentences. Stop and ask me only where a phase says so, or when you need something only I can do (accounts, credentials, approvals).

## 2. Product context

**User:** Sumit, the only product manager at a 15-person startup selling a code review automation tool to mid-size engineering teams.

**Problem:** Every Friday he spends about 90 minutes manually searching 2–3 developer communities for discussions about code review, CI/CD automation and developer workflow, then pastes notes into a Google Doc. It's inconsistent and he can't compare weeks. He suspects "false positive rate" keeps coming up but can't tell whether that's 4 mentions or 14, or whether it's growing.

**PulsePoint** produces a Friday-morning brief, before his afternoon engineering sync, answering:
1. What are developers struggling with most this week?
2. Which pain points are rising, easing, stable, or newly observed versus last week?
3. Which problems look unresolved or underserved by existing tools?
4. What evidence supports each claim? He must be able to open the original discussions.
5. What should he investigate before Monday's sprint planning? These are suggestions only; prioritisation always stays with Sumit.

Topics and keywords live in the database, so they change without code changes or redeploys.

## 3. Hard constraints

- **AI:** Gemini Flash only (`GEMINI_MODEL`, default `gemini-2.5-flash`). Never use the Claude API or any Anthropic SDK in the application.
- **Database:** Neon Postgres via `postgres.js` (`src/lib/db.ts`). No Supabase. Migrations in `db/migrations/`, applied by `npm run db:migrate`.
- **Hosting:** Vercel, with crons in `vercel.json`. Code on GitHub.
- **Live data:** use real data from official APIs only. Never present sample data as live.
- **Secrets:**
  - Keys live only in `.env.local` (local) and Vercel environment variables (production).
  - Never print, log, echo, commit or paste their values: not in the terminal, code, commit messages or replies to me.
  - To check a variable, check presence only.
  - Before every push, confirm `.gitignore` covers `.env*` and scan the diff for key-like strings.
- **Trust invariants (must survive every change):**
  - All counts, changes, percentages and trend labels are computed in code (`src/lib/trends.ts`, `src/lib/metrics.ts`), never by the model.
  - A zero baseline shows "New", never a percentage.
  - The frequency unit is unique discussions; keyword mentions are reported separately.
  - Quotes appear only if verified verbatim (`quoteIsVerbatim`).
  - AI claims without supplied evidence IDs are removed (`validateSynthesis`).
  - Reports are immutable, versioned snapshots.
  - Community text is untrusted: HTML is stripped, it renders as plain text, and it is fenced in prompts.
  - Every AI-generated passage in the UI carries the violet "AI reading" mark.
- **Design:** `docs/DESIGN.md` is the source of truth. Any new UI must use its tokens and components and pass WCAG 2.2 AA. The original inspiration images are in `design-references/`.
- **Honesty:** never claim something works unless you ran it. Never fabricate test results, data, links or URLs.

## 4. Current state (read before changing anything)

Read `CLAUDE.md`, `README.md`, `docs/DESIGN.md`, `docs/NINE_CHECKS.md`, `docs/COMPONENTS_MAP.md`, `docs/RESEARCH.md`, then skim `src/`.

**Pipeline** (`src/lib/pipeline/`): collect → analyze → report, coordinated by `run.ts`.
- **Collect:**
  - per keyword × source;
  - 3-day overlap, with a 15-day backfill for new keywords;
  - exact-phrase check and duplicate removal;
  - a source is skipped after 3 failures in a row.
- **Analyze:** Gemini in batches of 10, schema-validated, quotes verified, one database transaction per batch.
- **Report:** deterministic metrics, data-quality notes, AI synthesis that must cite evidence, saved as a versioned snapshot in one transaction.
- **Orchestrator (`run.ts`):** 240-second time budget, a lock so only one run happens at a time, and only one scheduled report per week.

**Sources** (`src/lib/sources/`): Hacker News (Algolia), Stack Overflow (Stack Exchange), GitHub Issues (optional, off by default).

**Security:**
- Basic auth via `src/middleware.ts`; cron routes check `CRON_SECRET`.
- Neon's `channel_binding=require` parameter is stripped in `src/lib/dburl.ts` (postgres.js would otherwise pass it to the server, which rejects it).

**UI:** nine sections — Dashboard (Friday brief), Weekly reports (with week-vs-week comparison), Pain points, Opportunities, Discussions, Sources, Topics & keywords, System health, Settings.
- The top bar has search, a week selector, a "vs previous week" switch, data freshness, and Generate report.
- Screenshots of every screen (sample data) are in `docs/screenshots/`.

**Verified so far** (in a sandbox with **mocked** APIs only):
- 41 tests pass: 35 unit tests, 5 integration tests and 1 circuit-breaker test.
- Type-check, lint and build are clean.
- An axe accessibility check found zero WCAG AA violations on all pages and the evidence drawer.
- No horizontal overflow at 390, 768 and 1440 px.
- 16 interactive controls were clicked through in a headless browser.

**Never verified:** real Hacker News or Stack Exchange responses, real Gemini calls, the real Neon database, Vercel crons. This is the main risk.

**Test commands:**
- `npm test`: unit tests; integration tests are skipped unless `TEST_DATABASE_URL` is set.
- `TEST_DATABASE_URL=… npm run test:integration`: the full pipeline on Postgres. **It drops the schema**, so use a throwaway database or a Neon branch, never production.
- `SEED_VISUAL_DB=… npx vitest run tests/fixtures/visual-seed.test.ts`: loads 8 simulated weeks for **local design QA only**. It also drops the schema. Never use it on production.

## 5. Phases

### Phase 0: Orient (no code changes)
1. Run `npm install`, `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, and report the results.
2. Confirm `.env.local` exists and report which of `DATABASE_URL`, `GEMINI_API_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD` are set. Presence only, never values.
3. **Security reminder for me:** these keys were pasted into a chat during setup. Remind me once to rotate the Neon password and Gemini key before the app is shared, then continue.
4. Note: the Gemini key may not start with `AIza` (standard Google AI Studio keys do). If real calls fail with 400/401/403, tell me to create a standard key in AI Studio rather than working around it.

### Phase 1: Prove it works with live data (highest priority)
1. Run `npm run db:migrate` against Neon. Confirm the tables and the 13 seed keywords exist.
2. Run `npm run dev`, log in (username `sumit`, password from `.env.local`), and click **Generate report**. Repeat until System health shows nothing waiting for analysis.
3. Fix whatever reality breaks. Likely areas:
   - real Algolia or Stack Exchange response shapes;
   - Stack Exchange `backoff` and quota;
   - Gemini rejecting parts of `responseSchema` (nullable fields, enums, uppercase types);
   - Gemini free-tier rate limits (tune `GEMINI_MIN_INTERVAL_MS`);
   - model name availability;
   - Neon cold starts and TLS through the pooler.
   For each fix, add a regression test using a captured response shape with personal data removed.
4. **Quality check:** read 15 random classified discussions yourself and report:
   - how many you'd classify differently;
   - whether pain-point keys fragment (the same problem under several keys);
   - roughly how many relevant pain discussions arrive per week.
   If keys fragment, tighten the prompt in `src/lib/pipeline/prompts.ts` and bump `ANALYSIS_VERSION`.
5. Screenshot the brief with real data and compare it against `docs/DESIGN.md`. Real titles, quotes and AI text are longer and messier than the sample data, so check:
   - truncation and wrapping;
   - very long headlines;
   - empty sections;
   - pages with only one week of history.
   Fix the layout where needed without breaking the design system.
6. Write `docs/LIVE_VERIFICATION.md`: what ran, real counts, issues found and fixed, remaining concerns.
7. **Stop and show me the summary** before Phase 2.

### Phase 2: Ship
1. Create a GitHub repository and push. Before pushing, confirm none of these patterns appear anywhere in `git log -p`: `npg_`, `napi_`, `AIza`, `AQ.`, or a 64-character hex string.
2. Deploy to Vercel (import the GitHub repo). **Ask me to add the environment variables in Vercel myself; never enter secret values yourself.**
3. Verify on the live URL:
   - login works;
   - a manual Generate report completes;
   - `/api/cron/daily` returns 401 without the secret;
   - both crons appear under Settings → Cron Jobs;
   - one cron triggered from the Vercel dashboard succeeds.
4. Set `APP_URL` to the production URL.

### Phase 3: High-value additions
Build these in order. Each must be fully working, tested, and follow `docs/DESIGN.md`. If you can't finish one properly, skip it and tell me.

1. **Email delivery of the brief:**
   - use Resend (`RESEND_API_KEY`, `BRIEF_RECIPIENTS`);
   - the Friday cron emails a clean HTML summary with a link to the full brief, so the brief actually *arrives*, as the problem statement asks;
   - Settings shows whether email is configured.
2. **Feedback on findings:**
   - "Useful / Not useful" buttons on each finding and recommendation, stored in a new table with its own migration;
   - Weekly reports shows the usefulness rate;
   - this makes the impact measurable (Nine Checks #5).
3. **Pain-point taxonomy management** (on the Pain points page):
   - rename, merge and split pain-point keys;
   - merges apply to future reports; past snapshots stay unchanged but record the merge;
   - this fixes AI key fragmentation.
4. **Sales-objection mapping:**
   - Sumit enters objections his sales team hears in demos;
   - the brief highlights matching pain points, using Gemini matching validated against existing keys;
   - this comes directly from the problem statement.
5. **Failure alerts:**
   - when a scheduled run fails, or a source fails three runs in a row, notify a named maintainer by Slack webhook or email;
   - this addresses Nine Checks #9 (owner).
6. **Export:** a "Copy for sprint planning" Markdown export of the brief, plus a print stylesheet.
7. **Classifier evaluation:**
   - an `npm run eval` script runs the analysis prompt over hand-labelled items in `eval/labels.json` (start with 30 from Phase 1);
   - it reports how often the type of discussion and the pain-point key match the hand labels.

### Phase 4: Quality gates
- Keep every existing test passing. Add unit and integration tests for all new logic.
- Add Playwright end-to-end tests:
  - log in, view the brief, filter, open evidence;
  - switch week, toggle the comparison;
  - search, add a keyword;
  - a manual run with the pipeline mocked.
- Add `@axe-core/playwright` checks on every page and the open drawer, with zero WCAG AA violations. Wait for the drawer's 180 ms animation to finish before auditing.
- Check every page for horizontal overflow at 390, 768 and 1440 px.
  - Known gotcha: screen-reader-only (`sr-only`) text inside scroll containers or truncated links must have a `relative` ancestor, or it can stretch the page sideways.
- Run Lighthouse on the brief, targeting ≥ 90 for Performance, Accessibility and Best Practices.

### Phase 5: Final documentation
- Update the README, `docs/COMPONENTS_MAP.md` and `docs/architecture.mmd` with every new component (Resend, feedback, objections, alerts). Validate the Mermaid.
- Update `docs/NINE_CHECKS.md` verdicts with real evidence from Phase 1.
- Refresh `docs/screenshots/` with real data.

## 6. Definition of done
- A live Vercel URL working with real data, a GitHub repo with no secrets, and both crons registered and verified.
- Every visible control works; nothing implies a live integration that isn't real.
- All tests, type-check, lint and build pass; axe and Lighthouse results reported.
- `LIVE_VERIFICATION.md`, the updated Components Map, Nine Checks and screenshots are committed.

## 7. Reporting
At the end of each phase, tell me:
- what you did;
- what you verified, and how;
- what's pending;
- what you need from me.

At the very end, give me the live URL, the GitHub URL, test results, and a plain list of known limitations.
