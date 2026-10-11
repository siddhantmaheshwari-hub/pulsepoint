# PulsePoint — Claude Code Build Prompt

Paste everything below the line into Claude Code, running inside the `pulse` project folder.

---

## 1. Your role

Act as my senior product designer, design engineer, full-stack developer and data engineer. Your quality bar is the best SaaS products in the world. You are not starting from zero: a working, tested codebase already exists in this folder. Your job is to (a) prove it works end to end with live data, (b) redesign it into **PulsePoint**, a distinctive, premium product, (c) add the high-value features listed below, and (d) deploy it.

Work in the phases below, in order. Make routine technical decisions yourself and explain important trade-offs in one or two sentences. Stop and ask me only when a phase says so, or when you need something only I can do (credentials, accounts, a design decision the references don't settle).

## 2. Product context

**User:** Sumit, the only product manager at a 15-person startup that sells a code review automation tool to mid-size engineering teams.

**Problem:** Every Friday he spends ~90 minutes manually searching 2–3 developer communities for discussions about code review, CI/CD automation and developer workflow, then dumps notes into a Google Doc. It's inconsistent and he can't compare weeks. He suspects "false positive rate" keeps coming up but can't tell whether it was 4 mentions or 14, or whether it's growing.

**What PulsePoint does:** It automatically produces a Friday-morning brief, before his afternoon engineering sync, answering:
1. What are developers struggling with most right now?
2. Which pain points are rising, declining, stable, or newly observed versus last week?
3. Which problems look unresolved or underserved by existing tools?
4. What is the evidence? He must be able to open the original discussions behind every claim.
5. What should he investigate before Monday's sprint planning? These are suggestions only; prioritisation always stays with Sumit.

Monitored topics and keywords live in the database so Sumit can change them without code changes or redeploys.

## 3. Hard constraints (do not break any of these)

- **AI:** Gemini Flash for every AI task (`GEMINI_MODEL`, default `gemini-2.5-flash`). Never use the Claude API or any Anthropic SDK in the application.
- **Database:** Neon Postgres via `postgres.js` (`src/lib/db.ts`). Do not reintroduce Supabase. Migrations live in `db/migrations/` and are applied by `npm run db:migrate`.
- **Hosting:** Vercel, with crons in `vercel.json`. Code lives on GitHub.
- **Live data:** use real data from official APIs (Hacker News Algolia, Stack Exchange; GitHub Issues optional). Never present sample data as live. Illustrative data is allowed only in clearly labelled demo or empty states.
- **Secrets:**
  - Keys live only in `.env.local` locally and in Vercel environment variables in production.
  - Never print, log, echo, commit or paste their values: not in the terminal, the code, commit messages or your replies to me.
  - Check `.gitignore` covers `.env*` before every push.
  - When you need to confirm a variable exists, check for presence only, e.g. `node -e "console.log(!!process.env.X)"` after loading the env file.
- **Trust invariants that already exist and must survive the redesign:**
  - All counts, changes, percentages and trend labels are computed by code (`src/lib/trends.ts`, `src/lib/metrics.ts`), never by the model.
  - A zero baseline shows "New", never a percentage.
  - Unit of frequency = unique discussions, with keyword mentions reported separately.
  - Quotes are shown only if verified verbatim against the source (`quoteIsVerbatim`).
  - AI claims without supplied evidence IDs are removed (`validateSynthesis`).
  - Reports are immutable, versioned snapshots.
  - Untrusted community text is stripped of HTML, rendered as plain text, and fenced inside prompts.
- **Honesty:** never claim something works unless you ran it. Never fabricate test results, data, links or deployment URLs.

## 4. What already exists (read before changing anything)

Read `README.md`, `docs/NINE_CHECKS.md`, `docs/COMPONENTS_MAP.md`, `docs/RESEARCH.md`, `docs/architecture.mmd`, and skim `src/`.

- **Pipeline** (`src/lib/pipeline/`): collect (per keyword × source, 3-day overlap, 15-day backfill for new keywords, exact-phrase check, dedupe by source ID and content fingerprint) → analyze (Gemini batches of 10, zod validation, verbatim quote check, pain-point catalogue reuse, one transaction per batch) → report (deterministic metrics, data-quality checks, cited AI synthesis, versioned snapshot in one transaction) → orchestrator (`run.ts`: 240 s budget, concurrency lock, idempotent Friday report).
- **Routes:**
  - `/api/cron/daily` and `/api/cron/weekly` (protected by `CRON_SECRET`);
  - `/api/runs` (manual trigger);
  - `/api/pain-points/[key]` (weekly history).
- **Pages:** Friday brief (`/`), Report history (`/reports`), Collection status (`/runs`), Topics & keywords (`/topics`).
- **Access:** HTTP Basic auth via `src/middleware.ts` (`DASHBOARD_USER` / `DASHBOARD_PASSWORD`). Mutations are refused when no password is set.
- **Tests:** 35 unit tests, plus 5 integration tests that run the full pipeline against Postgres with community APIs and Gemini mocked (`npm run test:integration` with `TEST_DATABASE_URL`). That command **drops the schema**, so never point it at the production database; use a Neon branch.
- **Known quirk already handled:** Neon's connection string includes `channel_binding=require`, which `src/lib/dburl.ts` strips (postgres.js would forward it to the server, which rejects it).

## 5. Phases

### Phase 0: Orient (no code changes)
1. Run `npm install`, `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, and report the results.
2. Confirm `.env.local` exists and which of `DATABASE_URL`, `GEMINI_API_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD` are set. Report presence only, never values.
3. The Gemini key may not start with `AIza` (standard Google AI Studio keys do). If a real call later fails with 400/401/403, tell me to create a standard key in AI Studio rather than working around it.
4. **Security note for me:** these credentials were pasted into a chat during setup. Remind me once to rotate the Neon password and Gemini key before the app is shared, then continue.
5. List the design references in `design-references/` (screenshots, `links.md`, palettes). **If the folder is missing or empty, stop and ask me to add references before starting Phase 2.**

### Phase 1: Prove it works with live data (highest priority)
The code has only been tested with mocked APIs. This phase finds out whether the real world agrees.

1. Run `npm run db:migrate` against Neon. Confirm the tables and the 13 seed keywords exist.
2. Run `npm run dev`, log in, and trigger **Collect & generate brief**. Repeat until the analysis queue is empty.
3. Fix whatever reality breaks, for example:
   - real Algolia or Stack Exchange response shapes;
   - Stack Exchange `backoff` and quota handling;
   - Gemini rejecting part of `responseSchema` (nullable fields, enums);
   - Gemini rate limits on the free tier (tune `GEMINI_MIN_INTERVAL_MS`);
   - Neon cold starts;
   - TLS through the pooler.
   Add a regression test for each fix, using a captured response shape with personal data removed.
4. Sanity-check the output by reading 15 random classified discussions yourself. Report:
   - how many you'd classify differently;
   - whether pain-point keys are fragmenting (the same problem under several keys);
   - roughly how many relevant pain discussions arrive per week.
   If keys fragment, tighten the prompt and catalogue reuse before moving on.
5. Write `docs/LIVE_VERIFICATION.md`: what ran, real counts, issues found and fixed, remaining concerns.

### Phase 2: Design system from my references
1. Study every reference: layout, grid, spacing scale, typography, colour, borders, depth, iconography, motion, data-visualisation style and interaction patterns. For each, note what makes it feel premium and what does not suit PulsePoint.
2. Combine them into one coherent language. Where references conflict, decide based on usability, clarity and PulsePoint's purpose (an editorial intelligence briefing, not a wall of cards), and write down why.
3. Write `docs/DESIGN.md` covering:
   - design principles (3–5, specific to PulsePoint);
   - tokens: colour (light and dark), type scale, spacing, radii, borders, elevation, motion durations and easing;
   - component specs;
   - data-viz rules;
   - voice and microcopy rules.
4. Implement the tokens in `tailwind.config.ts` / CSS variables. Load fonts locally (e.g. `@fontsource`) so builds don't depend on network access.
5. Avoid generic AI-dashboard tells unless a reference explicitly calls for them:
   - identical rounded cards everywhere;
   - decorative gradients;
   - all-caps eyebrow labels on every section;
   - an arrow appended to every link;
   - big-number-with-small-label hero stats by default.
6. **Stop and show me** `DESIGN.md` plus one rebuilt screen (the Friday brief) before redesigning the rest.

### Phase 3: Rebuild every screen as PulsePoint
- Rename the product to **PulsePoint** everywhere: UI, metadata, README, docs, Slack text, page titles and favicon.
- **Friday brief** (primary screen). It must be readable in under 2 minutes, structured like an editorial briefing:
  - lead headline;
  - key figures, with discussions vs. keyword mentions clearly distinguished;
  - the pain-point ranking with current vs. previous counts and trend;
  - "what stands out" (AI, with evidence);
  - potentially underserved problems (rule-based);
  - things to investigate;
  - data quality and confidence.
  - Filters for source, topic, trend and underserved. Every claim links to its evidence.
- **Evidence view:**
  - pain-point detail with weekly history (at least 8 weeks once data exists);
  - verified quotes;
  - links to the original threads, opening in a new tab with `rel="noopener noreferrer nofollow"`;
  - resolution status and mentioned workarounds.
- **Report history:** browse past weeks and versions; compare any two weeks.
- **Collection status:** run health per source, analysis queue, errors in plain language with what to do next.
- **Topics & keywords:** add, pause and resume; show when a keyword is still backfilling and how many discussions each keyword brought in last week.
- **States:** design loading, empty (first run), partial failure, insufficient data and error states for every screen. Empty states must say what to do next.
- **Responsive:** excellent at 375 px, 768 px and 1440 px.
- **Accessibility:** WCAG 2.2 AA contrast, full keyboard use, visible focus, correct dialog semantics, `prefers-reduced-motion` respected, and colour never the only carrier of meaning.
- **Motion:** purposeful and minimal. Use transitions that explain change (opening evidence, applying filters), not decoration.

### Phase 4: High-value additions
Build these in order. Each must be fully working and tested; skip any you can't finish properly and tell me.

1. **Email delivery of the brief.**
   - Use Resend, keyed by `RESEND_API_KEY`, sending to `BRIEF_RECIPIENTS`.
   - The Friday cron emails a clean HTML summary with a link to the full brief, so the brief actually *arrives*, as the problem statement asks.
2. **Feedback on findings.**
   - "Useful / Not useful" on each finding and recommendation, stored in a new table.
   - The usefulness rate is shown on Report history. This makes impact measurable (Nine Checks #5).
3. **Pain-point taxonomy management.**
   - Rename, merge and split pain-point keys from the UI.
   - Merges apply to future reports; past snapshots stay unchanged but note the merge.
   - This fixes AI key fragmentation.
4. **Sales-objection mapping.**
   - Sumit can enter objections his sales team hears in demos (free text).
   - The brief highlights pain points that match an objection, via Gemini matching validated against existing keys.
   - This is called out directly in the problem statement.
5. **Failure alerts.**
   - When a scheduled run fails, or a source fails three runs in a row, notify the named maintainer (Slack webhook or email).
   - This addresses Nine Checks #9, the owner.
6. **Export:** a "Copy for sprint planning" Markdown export and a print-friendly stylesheet for the brief.
7. **Classifier quality check:**
   - an `npm run eval` script that runs the analysis prompt over a small hand-labelled set in `eval/labels.json` (start it with 30 items from Phase 1);
   - it reports kind accuracy and key agreement.
   - Run it whenever the prompt changes and bump `ANALYSIS_VERSION`.

### Phase 5: Quality gates
- Keep all existing tests passing. Add unit tests for new logic and integration tests for new tables and actions.
- Add Playwright end-to-end tests: log in, view the brief, filter, open evidence, add a keyword, manual run (mocked). Add automated accessibility checks with `@axe-core/playwright` on every page.
- Run Lighthouse on the brief, targeting ≥ 90 for Performance, Accessibility and Best Practices.
- Edge cases that must be tested:
  - missing history;
  - zero baseline;
  - duplicates and cross-posts;
  - malformed AI output;
  - partial source failure;
  - keyword added mid-period;
  - an empty week;
  - a very long title or quote.

### Phase 6: Ship
1. Push to GitHub (verify no secrets in the diff or history first: `git log -p | grep -iE "npg_|AIza|AQ\.|napi_"` must return nothing).
2. Deploy to Vercel. **Ask me to add the environment variables in Vercel myself; never add secret values yourself.** Use a separate Neon branch for preview deployments if possible.
3. Verify on the live URL:
   - login works;
   - the manual run completes;
   - `/api/cron/daily` returns 401 without the secret;
   - both crons appear under Vercel → Settings → Cron Jobs;
   - one cron triggered manually from Vercel succeeds.
4. Update the README, `docs/COMPONENTS_MAP.md`, `docs/architecture.mmd` (add any new components: Resend, feedback table, objections) and `docs/NINE_CHECKS.md` (update verdicts with real evidence from Phase 1).

## 6. Definition of done
- Live URL working with real data, a GitHub repo with no secrets, and both crons registered.
- Every visible control works; nothing implies a live integration that isn't real.
- All tests, typecheck, lint and build pass; Lighthouse and axe results reported.
- `DESIGN.md`, `LIVE_VERIFICATION.md` and the updated Components Map and Nine Checks are committed.

## 7. How to report back
At the end of each phase, give me a short summary:
- what you did;
- what you verified, and how;
- what's still pending;
- anything you need from me.

At the end, give me the live URL, GitHub URL, test results, and a plain list of known limitations.
