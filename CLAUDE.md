# PulsePoint — project memory for Claude Code

Developer-community intelligence for Sumit, sole PM at a 15-person code review automation startup.
Produces a Friday-morning brief: top developer pain points, week-over-week trends, underserved problems, with evidence links.
Final build brief: `PULSEPOINT_FINAL_BUILD_PROMPT.md` (earlier: `PULSEPOINT_BUILD_PROMPT.md`). Design system (source of truth): `docs/DESIGN.md`. Inspiration images: `design-references/`. Current UI: `docs/screenshots/`.

Status: **Final build shipped** (13 Oct 2026). Live at https://pulsepoint-two.vercel.app, verified in production (see `docs/LIVE_VERIFICATION.md`). Repo: https://github.com/siddhantmaheshwari-hub/pulsepoint.

## Stack
Next.js 15 App Router · React 19 · TypeScript · Tailwind · Neon Postgres via postgres.js (`src/lib/db.ts`) · Gemini Flash (REST, `src/lib/gemini.ts`) · Resend (brief + alert email) · Vercel + Cron (`vercel.json`) · GitHub.

## Commands
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`
- `npm run db:migrate` — applies `db/migrations/*.sql` (idempotent)
- `SEED_VISUAL_DB=… npx vitest run tests/fixtures/visual-seed.test.ts` — local design QA data only
- `TEST_DATABASE_URL=… npm run test:integration` — full pipeline on Postgres; DROPS THE SCHEMA, never use production

## Rules
- Gemini Flash only for AI. Never the Claude API in the app. Never Supabase.
- Never print, log or commit secret values from `.env.local`; check presence only.
- Numbers (counts, deltas, %, trends) come from code (`trends.ts`, `metrics.ts`), never from the model. Zero baseline = "New".
- Frequency unit = unique discussions; keyword mentions are separate.
- Quotes only if verbatim-verified; AI claims without supplied evidence IDs are dropped; reports are immutable snapshots.
- Community text is untrusted: strip HTML, render as text, fence in prompts.
- Never present sample data as live. Never claim something works without running it.

## Map
- `src/lib/pipeline/` collect → analyze → report → run (orchestrator, 240 s budget, lock, idempotent Friday report)
- `src/lib/sources/` Hacker News, Stack Overflow, GitHub adapters (all three enabled; Reddit pending, Discord/X not connected)
- `src/lib/email*.ts` Friday brief email (never twice, `brief_emails`); `src/lib/alert*.ts` failure alerts (once per problem per day, `alerts`)
- `src/lib/periods.ts`, `period-data.ts`, `components/PeriodView.tsx` Week | Month | Range (month/range: numbers only, no AI)
- `src/lib/votes.ts`, `voter.ts` team votes (one per person per item, `TEAM_MEMBERS`)
- `src/app/` nine sections (sidebar: Friday brief, Weekly reports, Pain points, Topics & keywords; More: opportunities, discussions, sources, health, settings) and API routes (cron, runs, pain-points)
- `src/components/` shell (frame, sidebar, top bar), pain (table, drawer, lead signal), viz (charts), ui (tokens in use)
- Design system: `docs/DESIGN.md` — follow it for any UI change
- No dashboard sign-in (testing build); cron routes use `CRON_SECRET`
- `docs/` Nine Checks, Components Map (+ SVG/PNG), live verification, research, Mermaid architecture, real-data screenshots
