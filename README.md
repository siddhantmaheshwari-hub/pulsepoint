# PulsePoint

Developer community intelligence. 
A weekly developer-community intelligence brief for a code review automation startup. It collects live discussions from Hacker News and Stack Overflow (GitHub Issues optional) for keywords stored in a Neon Postgres database, extracts structured pain points with **Gemini Flash**, computes week-over-week trends with **deterministic code**, and publishes a **Friday Morning Brief** at 06:00 IST and emails it to the team.

- Numbers (counts, Δ, %Δ, trends) are computed by code, never by the model.
- Quotes are displayed only when verified verbatim against the source text.
- AI findings that don't cite supplied evidence are removed before display.
- Every brief is stored as an immutable, versioned snapshot.

Docs: [Design system](docs/DESIGN.md) · [Nine Checks](docs/NINE_CHECKS.md) · [Components Map](docs/COMPONENTS_MAP.md) · [Research](docs/RESEARCH.md) · [Mermaid source](docs/architecture.mmd)

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Geist · Lucide icons · Neon Postgres (`postgres.js` driver) · Gemini Flash REST API · Vercel (hosting + Cron) · GitHub.

## Screens
| Section | What it answers |
|---|---|
| Dashboard | The Friday brief: headline, summary, biggest change, ranked pain points, volume, sources, topic movement, underserved problems, what to investigate, data quality |
| Weekly reports | Every stored brief and version; compare any two weeks |
| Pain points | Full ranking with filters, sorting, 8-week sparklines, evidence drawer |
| Opportunities | Recurring, mostly-unresolved problems with workarounds, evidence, confidence and limitations; single complaints listed only as early leads |
| Discussions | Original posts beside the AI reading; search, filter by week, source, topic and classification |
| Sources | Volume and pain per source, recent reliability, enable/pause |
| Topics & keywords | What PulsePoint listens for, with matches per keyword this week |
| System health | Last success, analysis queue, coverage, run log with errors |
| Settings | Which settings are configured (never their values), schedule, trend rules |

The top bar's week selector and "vs previous week" switch are stored in the URL (`?report=…&compare=off`) and carried across sections.

## Setup

### 1. Neon
1. Create a project at neon.tech (or in Vercel → Storage → Neon, which also adds `DATABASE_URL` to your project automatically).
2. Copy the **pooled** connection string (host contains `-pooler`, ends with `?sslmode=require`). Keep it server-side; never prefix it with `NEXT_PUBLIC_`.
3. Create the tables and starter keywords:
   ```bash
   DATABASE_URL='postgresql://…' npm run db:migrate
   ```
   The runner records applied files in `schema_migrations`, so running it again is safe. (Alternatively paste `db/migrations/0001_schema.sql` then `0002_seed.sql` into Neon's SQL Editor.)

### 2. Gemini
Create an API key at Google AI Studio. Default model: `gemini-3.8-flash` (`gemini-2.5-flash` is no longer available to new keys; override with `GEMINI_MODEL`).

### 3. Local run
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000 (no login)
```
Click **Collect & generate brief**. The first run backfills 15 days; if analysis is still queued when the 4-minute budget ends, click it again (or let the daily cron finish it).

### 4. Environment variables
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string; server-only |
| `GEMINI_API_KEY` | yes | |
| `GEMINI_MODEL` | no | default `gemini-3.8-flash` |
| `GEMINI_MIN_INTERVAL_MS` | no | default 4000 (free-tier friendly) |
| `CRON_SECRET` | yes | Vercel Cron sends it as a Bearer token automatically |
| `STACKEXCHANGE_KEY` | no | raises quota from 300 to 10,000 req/day |
| `GITHUB_TOKEN` | no | also enable `github` on the Topics page |
| `REPORT_TZ_OFFSET_MINUTES` | no | default 330 (IST) |
| `PIPELINE_BUDGET_MS` | no | default 240000 (< 300 s function limit) |
| `RESEND_API_KEY` | for email | Resend API key; emails the Friday brief |
| `BRIEF_RECIPIENTS` | for email | comma-separated addresses |
| `BRIEF_FROM` | no | default `PulsePoint <onboarding@resend.dev>` |
| `APP_URL` | no | link in the email; on Vercel defaults to the production domain |
| `SLACK_WEBHOOK_URL` | no | optional Friday Slack message |
| `TEAM_MEMBERS` | no | names for team votes; default `Sumit,Neha,Kabir` |

### 5. Deploy (GitHub + Vercel)
```bash
git remote add origin https://github.com/<you>/developer-community-pulse.git
git push -u origin main
```
Vercel → Add New Project → import the repo → add the environment variables → Deploy. `vercel.json` registers two crons:
- `0 1 * * *` → `/api/cron/daily` (collect + analyze, 06:30 IST)
- `30 0 * * 5` → `/api/cron/weekly` (final pass + brief + email, Friday 06:00 IST; the Friday daily run re-sends the email only if it failed)

Verify: open the URL, log in, run once manually, then check **Collection status**. In Vercel → Settings → Cron Jobs you can trigger each cron on demand.

## Testing
```bash
npm test          # 33 unit tests: trend math, zero baselines, windows, dedupe, mention counting,
                  # quote verification, malformed AI output, uncited-claim removal, metrics aggregation
                  # (+5 integration tests when TEST_DATABASE_URL is set)
TEST_DATABASE_URL=postgres://… npm run test:integration
                  # Runs the real pipeline SQL end to end against Postgres with community APIs and Gemini
                  # faked: collection, cross-post dedupe, retry after malformed AI output, quote rejection,
                  # exact weekly counts/trends, uncited-claim removal, source-failure reporting, idempotent
                  # Friday report, concurrency guard, keyword management, history endpoint.
                  # WARNING: drops and recreates the public schema — use a throwaway database or a Neon branch.
SEED_VISUAL_DB=postgres://… npx vitest run tests/fixtures/visual-seed.test.ts
                  # LOCAL DESIGN QA ONLY: fills a throwaway database with 8 simulated weeks by running the
                  # real pipeline with faked APIs. Never point it at production.
npm run typecheck
npm run lint
npm run build
```

## How the numbers work
- **Unit:** unique discussion (HN thread / SO question / GitHub issue). Keyword mentions are stored and shown separately.
- **Windows:** two consecutive 7-day periods ending at local midnight of the report day (half-open intervals).
- **Counted:** relevant discussions classified `workflow_pain` or `unmet_need`, excluding duplicates. `isolated_bug` is reported separately.
- **Absolute change** = current − previous. **% change** = Δ / previous × 100 when previous > 0; otherwise **New**.
- **Trend:** rising/declining need |Δ| ≥ 2 and |%Δ| ≥ 25; else stable. `gone` = seen last week only.
- **Sufficiency:** insufficient if < 3 discussions across both weeks; limited if < 8 or a single source.
- **Underserved:** ≥ 2 discussions this week and ≥ 50% unresolved/partially resolved.
- **Bucketing date:** the first matching activity of a thread. Late-arriving data is recomputed on each report; revisions to the previous week are disclosed while stored snapshots stay unchanged.

## Security
- The browser never connects to the database. `DATABASE_URL` is read only in server modules (`server-only` imports); all SQL is parameterized by the driver.
- Each analysis batch and each report snapshot is written in a single transaction.
- A source that fails 3 requests in a row is skipped for the rest of the run, so an outage can't consume the time budget.
- Cron routes require `CRON_SECRET`. The dashboard has no sign-in (testing build): anyone with the link can view it and make changes.
- Community text is stripped of HTML, rendered as plain text, and fenced in prompts with an instruction to ignore embedded instructions.
- External links use `rel="noopener noreferrer nofollow"`.

## Known limitations
- Reddit is not integrated (OAuth registration and commercial-use terms). Discord/Slack communities are out of scope.
- A long-running thread is counted in the week it first matched; new comments on an already-analyzed thread are not re-analyzed.
- Weekly counts for a niche keyword set may be small; read sufficiency labels before acting on a trend.
- Neon's free tier suspends idle compute; the first query after a pause takes a moment longer (the daily cron keeps it warm on weekdays).
- Vercel Hobby is for non-commercial use and limits each cron to once per day; a company tool should use Pro.
- No sign-in: fine for a testing build; add auth before real use.
