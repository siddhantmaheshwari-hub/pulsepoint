# PulsePoint — project memory for Claude Code

Developer-community intelligence for Sumit, sole PM at a 15-person code review automation startup.
Produces a Friday-morning brief: top developer pain points, week-over-week trends, underserved problems, with evidence links.
Full build brief and phases: `PULSEPOINT_BUILD_PROMPT.md`. Design system (source of truth): `docs/DESIGN.md`. Inspiration images: `design-references/`. Current UI: `docs/screenshots/`.

Status: built, redesigned and tested with mocked APIs. NOT yet verified against live Hacker News, Stack Exchange, Gemini, Neon or Vercel — that is the first job.

## Stack
Next.js 15 App Router · React 19 · TypeScript · Tailwind · Neon Postgres via postgres.js (`src/lib/db.ts`) · Gemini Flash (REST, `src/lib/gemini.ts`) · Vercel + Cron (`vercel.json`) · GitHub.

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
- `src/lib/sources/` Hacker News, Stack Overflow, GitHub adapters
- `src/app/` nine sections (/, reports, pain-points, opportunities, discussions, sources, topics, health, settings) and API routes (cron, runs, pain-points)
- `src/components/` shell (frame, sidebar, top bar), pain (table, drawer, lead signal), viz (charts), ui (tokens in use)
- Design system: `docs/DESIGN.md` — follow it for any UI change
- `src/middleware.ts` Basic auth; cron routes use `CRON_SECRET`
- `docs/` Nine Checks, Components Map, research, Mermaid architecture
