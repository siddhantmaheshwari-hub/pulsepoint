# PulsePoint

PulsePoint is an AI-powered **weekly developer-community intelligence digest** for Sumit, the PM of a code review automation startup. It collects live discussions from **Hacker News, Stack Overflow and GitHub Issues** for topics and keywords stored in a Neon Postgres database (editable in the app, no code changes), classifies them with **Gemini Flash**, computes week-over-week trends with **deterministic code**, and delivers a **Friday Morning Brief at 06:00 IST** — on the web and by email — showing the most frequent pain points, what is rising or easing, unresolved and underserved problems, and links to the original discussions. Sumit can switch to a month or any date range, the team (Neha, Kabir) votes on whether findings are useful, and a named maintainer is emailed if a scheduled run fails.

- **Live app:** https://pulsepoint-two.vercel.app
- **Code:** https://github.com/siddhantmaheshwari-hub/pulsepoint
- **Components Map:** [docs/COMPONENTS_MAP.md](docs/COMPONENTS_MAP.md) · diagram [SVG](docs/components-map.svg) / [PNG](docs/components-map.png) · [Mermaid source](docs/architecture.mmd)
- Also: [Live verification](docs/LIVE_VERIFICATION.md) · [Nine Checks](docs/NINE_CHECKS.md) · [Design system](docs/DESIGN.md) · [Research](docs/RESEARCH.md) · [Screenshots](docs/screenshots/)

Ground rules: numbers (counts, Δ, %Δ, trends) are computed by code, never by the model · quotes appear only when verified verbatim · AI statements that don't cite supplied evidence are removed · every weekly brief is an immutable, versioned snapshot · Gemini Flash only (Google AI Studio).

## How to use it (for examiners)

No login is needed; this is a testing build.

1. **Open the brief** — https://pulsepoint-two.vercel.app opens on the **Friday brief**: the headline and the paragraph marked **AI reading** are written by Gemini from cited evidence; every number beside them is computed by code.
2. **Read the ranking** — *What developers struggled with* lists pain points by unique discussions this week, with the change vs last week (**Rising / Easing / Stable / New**). *Underserved problems* are flagged by a code rule (2+ discussions, at least half unresolved). *Worth investigating before Monday* is the AI's suggestion list — suggestions, not decisions.
3. **Open evidence** — click any pain point row (or **Open evidence**) to see the original Hacker News / Stack Overflow / GitHub threads, verified quotes and workarounds; links open the source.
4. **Switch week / month / range** — in the top bar choose **Week** (stored weekly briefs, with the AI reading) or **Month** / **Range** (numbers computed on the fly from stored data, compared with the previous period of equal length; no AI text). Try [October 2026](https://pulsepoint-two.vercel.app/?view=month&m=2026-10).
5. **Vote** — click **Useful / Not useful** on a finding, pick a name (Sumit, Neha or Kabir); the tally shows who voted. *Weekly reports* shows the usefulness rate across votes.
6. **See how it's run** — *Topics & keywords* (what PulsePoint listens for, editable), and under **More**: *Sources* (health per source; Reddit pending approval, Discord and X not connected), *System health* (run log), *Settings* (what's configured, email and alert status).

## Screens

| Section | What it answers |
|---|---|
| **Friday brief** | Headline, summary, biggest change, ranked pain points, volume, sources, topic movement, underserved problems, what to investigate, data quality; team votes |
| **Weekly reports** | Every stored brief and version; compare two weeks; team usefulness rate |
| **Pain points** | Full ranking with filters, sorting, 8-week sparklines, evidence drawer |
| **Topics & keywords** | What PulsePoint listens for, with matches per keyword |
| More → Opportunities | Recurring, mostly-unresolved problems with workarounds and evidence |
| More → Discussions | Original posts beside the AI reading; filter by period, source, topic, classification |
| More → Sources | Volume and pain per source, reliability, enable/pause; other platforms' status |
| More → System health | Last success, analysis queue, coverage, run log with errors |
| More → Settings | Which settings are configured (never their values), email, alerts, schedule, trend rules |

The top bar's period (`?view=month&m=…`, `?view=range&from=…&to=…`, or `?report=…` for a week) and the "vs previous" switch live in the URL, so any view can be shared.

## Run it locally

```bash
cp .env.example .env.local   # fill in values (see below)
npm install
npm run db:migrate           # creates tables + starter keywords; safe to re-run
npm run dev                  # http://localhost:3000
```
Click **Generate report**. The first run backfills 15 days; if discussions are still queued when the 4-minute budget ends, run it again (or let the daily cron finish).

## Environment variables (names only — values live in `.env.local` and Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string (server-only) |
| `GEMINI_API_KEY` | yes | Google AI Studio key |
| `GEMINI_MODEL` | no | default `gemini-3.8-flash` |
| `GEMINI_MIN_INTERVAL_MS` | no | spacing between Gemini calls (default 4000) |
| `CRON_SECRET` | yes | protects `/api/cron/*`; Vercel Cron sends it as a Bearer token |
| `GITHUB_TOKEN` | for GitHub | fine-grained token, public repositories read-only |
| `STACKEXCHANGE_KEY` | no | raises Stack Exchange quota |
| `RESEND_API_KEY` | for email | Resend key for the brief and alerts |
| `BRIEF_RECIPIENTS` | for email | comma-separated recipients of the Friday brief |
| `BRIEF_FROM` | no | sender, default `PulsePoint <onboarding@resend.dev>` |
| `ALERT_EMAIL` | for alerts | named maintainer for failure alerts |
| `APP_URL` | no | links in emails; on Vercel defaults to the production domain |
| `TEAM_MEMBERS` | no | names offered for votes, default `Sumit,Neha,Kabir` |
| `REPORT_TZ_OFFSET_MINUTES` | no | default 330 (IST) |
| `PIPELINE_BUDGET_MS` | no | default 240000 (< 300 s function limit) |
| `SLACK_WEBHOOK_URL` | no | optional Friday Slack message |

## Deploy

Push to `main` on GitHub → Vercel builds and deploys. `vercel.json` registers two crons:
- `0 1 * * *` → `/api/cron/daily` — collect + analyse (06:30 IST); on Fridays also re-sends the brief email if the weekly send failed.
- `30 0 * * 5` → `/api/cron/weekly` — final pass, brief, email (Friday 06:00 IST).

After changing environment variables in Vercel, **Redeploy**. Run migrations with `npm run db:migrate` (never the integration tests) against production.

## Testing

```bash
npm test             # 86 unit tests: trend math, zero baselines, IST windows and calendar periods,
                     # dedupe, quote verification, malformed AI output, metrics, email builder,
                     # "never emailed twice", team votes, alert rules and once-per-day (PGlite)
npm run typecheck
npm run lint
npm run build
TEST_DATABASE_URL=postgres://… npm run test:integration
                     # Full pipeline SQL on Postgres with APIs faked.
                     # WARNING: drops the public schema — throwaway database only, never production.
```

## How the numbers work
- **Unit:** unique discussion (HN thread / SO question / GitHub issue). Keyword mentions are counted separately.
- **Windows:** weekly = two consecutive 7-day periods ending at local midnight (IST); Month/Range = the selected period vs the previous period of equal length.
- **Counted:** relevant discussions classified `workflow_pain` or `unmet_need`, excluding duplicates; `isolated_bug` reported separately.
- **Change:** Δ = current − previous; %Δ = Δ / previous × 100 when previous > 0, otherwise **New**.
- **Trend:** rising/easing need |Δ| ≥ 2 and |%Δ| ≥ 25, else stable.
- **Sufficiency:** insufficient if < 3 discussions across both periods; limited if < 8 or a single source.
- **Underserved:** ≥ 2 discussions and ≥ 50% unresolved/partially resolved.

## Security
- The browser never connects to the database; `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `GITHUB_TOKEN` are server-only. All SQL is parameterised.
- Cron routes require `CRON_SECRET` (verified live: 401 without it).
- No dashboard sign-in in this testing build: anyone with the link can view and make changes (generate a report, edit keywords, vote, send the test email to the configured recipients).
- Community text is stripped of HTML, rendered as plain text and fenced in prompts. Alert emails redact anything that looks like a key.

## Known limitations
- **No sign-in** (testing build) — votes use a self-chosen name; add auth before real use.
- **Email on Resend's free plan** reaches only the account owner's address until a domain is verified, so Neha, Kabir and a separate maintainer can't receive the brief or alerts yet.
- **Volume is modest**: ~10 pain discussions/week from HN + SO; GitHub adds more but is capped at 20 issues per keyword per run and is noisy (about half off-topic). Trends are labelled with data sufficiency.
- Some keywords are noisy (`false positives`, `build times`, `developer productivity`) — suggested replacements are in [LIVE_VERIFICATION.md](docs/LIVE_VERIFICATION.md); Sumit decides.
- Reddit is pending API approval; Discord and X are not connected.
- Month/Range views are numbers only — the AI-written brief exists for weekly snapshots.
- With GitHub enabled, a run can leave discussions queued for analysis; the next run finishes them.
- Monitoring began 27 Sept 2026; earlier periods show "Not monitored yet".
- Vercel Hobby crons may fire any time within their hour and the plan is for non-commercial use; a company tool should use Pro.
