# PulsePoint — Final Build Prompt (v3, "finish and submit")

> **How to start:** open Claude Code in the `pulse` folder and type:
> `Read PULSEPOINT_FINAL_BUILD_PROMPT.md and CLAUDE.md, then do Step 0 only and report back.`
>
> Then say `Go to Step N` after each step is approved.

---

## 1. Role and working style

You are my senior full-stack engineer. I am a **beginner**, so:

- **Keep it simple.** Prefer the smallest change that fully works. No new frameworks, no new libraries except `resend`. No refactors of working code.
- **One step at a time.** Do exactly one step, run the checks, then stop and report in plain English. Wait for "go" before the next step.
- **Explain like a teammate.** For each step say: what you changed (file list), how you tested it, what I need to do (if anything), and what's next. Keep it short.
- **Tell me exactly what to click** whenever I must do something in Vercel, Resend, Neon or GitHub.
- **Honesty.** Never claim something works unless you ran it. If something can't be finished properly, skip it and tell me.

## 2. What already exists (do not rebuild)

PulsePoint is built, live-verified locally (see `docs/LIVE_VERIFICATION.md`) and pushed to
`github.com/siddhantmaheshwari-hub/pulsepoint` (Vercel project `sid-a99c/pulsepoint`).

- Pipeline collect → analyze → report in `src/lib/pipeline/` (works with real HN, Stack Exchange, Gemini, Neon).
- Nine-section UI following `docs/DESIGN.md`; Friday brief on `/`.
- Markdown export of the brief, and "Useful / Not useful" ratings (`finding_feedback`, migration `0004`).
- 48 unit + 7 integration tests; typecheck and lint clean.

## 3. The goal (from the exam problem statement)

Build and deploy an AI-powered **weekly developer-community intelligence digest** for Sumit, **delivered every Friday morning**, that shows: most frequent pain points, trend up/down vs the prior week, unresolved/underserved problems, and evidence links. Topics and keywords are editable in the database without code changes.

Submission needs: **a working public Vercel URL**, the GitHub repo link, and the **Components Map**. Rules: live external data, **Gemini Flash only** (never Claude API), deployed on Vercel.

Gaps this build closes:
1. The brief must **arrive** (email), not just sit on a page.
2. Examiners must be able to **open the URL** (today everything is behind a password).
3. Sumit wants to pick a **week, month or custom range** (calendar), per our Components Map.
4. The **team (Neha, Kabir)** votes 👍/👎 on problems, not only Sumit.
5. Prove the **Vercel crons** actually run.

## 4. Rules that must survive every change (unchanged from v2)

- Gemini Flash only, called directly via Google AI Studio (`src/lib/gemini.ts`). No Claude API, no OpenRouter, no Supabase (Neon is the approved database).
- Numbers come from code (`trends.ts`, `metrics.ts`), never the model. Zero baseline = "New". Frequency unit = unique discussions.
- Quotes only if verbatim; uncited AI claims dropped; reports are immutable snapshots.
- Community text is untrusted: strip HTML, render as text.
- Every AI passage shows the violet "AI reading" mark. New UI uses `docs/DESIGN.md` tokens and components.
- **Secrets:** never print, log, echo or commit values. Check presence only. Before every push, scan the diff for `npg_`, `napi_`, `AIza`, `re_`, `AQ.` and long hex strings.
- `npm run test:integration` and the visual seed **drop the schema**: never point them at production.

---

## 5. Steps

### Step 0 — Health check (no code changes)
1. Run `npm install`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Report pass/fail.
2. Report which env vars in `.env.local` are set (presence only).
3. Tell me which commit is on `origin/main` and whether local is ahead or behind.
4. Ask me for the live Vercel URL, then give me a 5-item checklist to confirm in the Vercel dashboard myself: latest deployment is "Ready"; env vars `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CRON_SECRET`, `DASHBOARD_PASSWORD` exist for Production; Settings → Cron Jobs lists both crons; Logs show no errors in the last day.

**DONE WHEN:** I've replied with the URL and checklist results.

### Step 1 — Public read-only access + simple sign-in
Examiners must open the URL without a password; changes still need the password.

- **GET pages are public** (read-only). Data is public community content; no personal data is stored.
- Add a small `/login` page (one password field, DESIGN.md styling). On success, set an **httpOnly, secure, signed cookie** (HMAC of a fixed string with `DASHBOARD_PASSWORD`, 30-day expiry). Add "Sign out".
- `src/middleware.ts`: any non-GET request (server actions, `POST /api/runs`, votes, keyword edits) requires the cookie, else 401. Keep `/api/cron/*` excluded (they check `CRON_SECRET`).
- When signed out, buttons that change things (Generate report, add keyword, votes) show **"Sign in to …"** and link to `/login`, instead of failing silently.
- Remove Basic-auth code once the cookie works.
- Tests: unit test for cookie sign/verify and for the middleware rule (GET allowed, POST blocked without cookie, cron path untouched).

**DONE WHEN:** in an incognito window the brief opens with no prompt; Generate report asks me to sign in; after signing in it works.

### Step 2 — Email the Friday brief (Resend)
- Add `resend` package. New env vars: `RESEND_API_KEY`, `BRIEF_FROM` (default `PulsePoint <onboarding@resend.dev>`), `BRIEF_RECIPIENTS` (comma-separated), `APP_URL`.
- New file `src/lib/email.ts`: builds a **simple, clean HTML email** (inline styles, works in Gmail): headline, 3–5 top pain points with count, change label (Rising / Easing / Stable / New) and one evidence link each, underserved problems, "Worth investigating" list, and a big **"Open the full brief"** button linking to `APP_URL/?report=<id>`. Also a plain-text version. AI text is labelled "AI reading". Numbers come from the stored report, never recomputed by AI.
- New migration `0005_brief_emails.sql`: table `brief_emails (report_id unique, sent_at, recipients, status, error)` so a brief is **never emailed twice**.
- Sending rule: after the weekly cron saves a report, send the email. **Catch-up:** if the Friday daily cron runs and this week's report exists but no email was sent, send it then.
- Settings page: show "Email: configured / not configured", the recipient list (masked like `s***@gmail.com`), last sent time, and a **"Send test email"** button (signed-in only) that sends the latest brief.
- Change the weekly cron in `vercel.json` to `30 0 * * 5` (Friday 06:00 IST), matching our Components Map. Keep daily at `0 1 * * *`.
- Tests: email HTML builder (contains headline, links, no "undefined", escapes HTML in titles), and the "never twice" rule.
- **Tell me exactly:** how to create a Resend account and API key, that on the free plan without a verified domain Resend only delivers to the email I signed up with, and how to add the 4 env vars in Vercel and redeploy.

**DONE WHEN:** "Send test email" delivers a readable brief to my inbox, and the link opens the right brief.

### Step 3 — Calendar: week, month or custom range
Replace the week dropdown in the top bar with a period picker: **Week | Month | Range** (segmented pill control from DESIGN.md).

- **Week** = today's behaviour (the stored weekly snapshot, with AI reading).
- **Month** = a calendar-month picker. **Range** = two date inputs (start, end; max 92 days).
- Month and range views are **computed from stored data on the fly**, no new collection and **no new AI call**: reuse `buildMetrics()` with a custom window and compare against the **previous period of equal length**. Show the pain-point ranking with counts, change labels and evidence links, plus the volume chart.
- Show a clear note on these views: "Numbers only. The AI-written brief is produced weekly — switch to Week to read it." Hide AI sections there; don't fake them.
- Keep the URL shareable: `?view=month&m=2026-10` or `?view=range&from=…&to=…`.
- If part of the period is before monitoring started, show the existing "Not monitored yet" treatment.
- Tests: window maths for month and range (month boundaries in IST, previous equal-length period, max length).

**DONE WHEN:** I can pick September 2026 and a custom 10-day range and see sensible counts that match the Discussions page for the same dates.

### Step 4 — Team votes 👍 / 👎
Extend the existing "Useful / Not useful" ratings so each teammate votes once.

- Env var `TEAM_MEMBERS` (default `Sumit,Neha,Kabir`). On first vote, ask "Who are you?" with those names; remember the choice in a cookie; show "Voting as Neha · change".
- Migration `0006_votes_voter.sql`: add `voter text not null default 'Sumit'` to `finding_feedback`; change the unique key to `(report_id, item_type, item_index, voter)`. Existing rows stay as Sumit's.
- Each finding / underserved problem / recommendation shows a tally: **👍 2 · 👎 1** with the voters' names on hover/focus. Buttons have accessible labels ("Mark useful", not only an emoji).
- Votes require sign-in (shared team password). Weekly reports keeps showing the usefulness rate, now across all voters.
- Tests: one vote per person per item; changing a vote updates it; tally counts.

**DONE WHEN:** voting as Sumit and then as Neha on the same item shows 👍 2.

### Step 5 — Simpler navigation
Nine menu items is a lot. Without deleting pages:

- Sidebar main items: **Friday brief, Weekly reports, Pain points, Topics & keywords**.
- Under a quiet "More" group: Opportunities, Discussions, Sources, System health, Settings.
- Make sure every page still has a clear title and nothing links to a removed route.

**DONE WHEN:** sidebar shows 4 main items + "More", all pages still open at 390 px and 1440 px with no sideways scroll.

### Step 6 — More signal, less noise (mostly settings, little code)
Live verification found only ~10 pain discussions/week and noisy keywords.

1. **Turn on GitHub Issues** (adapter already exists). Tell me how to create a fine-grained GitHub token with **public-repo read only**, add `GITHUB_TOKEN` locally and in Vercel, then enable the source. Run one collection and report how many new matching threads it found.
2. **Suggest** keyword changes for Sumit as a short table (do not apply them yourself — I'll edit them on the Topics page): e.g. replace "false positives" with "false positive rate" / "review bot false positives"; narrow or drop "build times" and "developer productivity". Base suggestions on the real match/relevance counts in the database.
3. Leave Reddit as "Waiting for approval" in Sources; Discord and X stay "not connected". Don't build adapters for them.

**DONE WHEN:** GitHub shows as healthy on the Sources page with real items, and I have the keyword table.

### Step 7 — Failure alert (small, reuses Step 2)
- When a **scheduled** run fails, or a source fails 3 runs in a row, email `ALERT_EMAIL` (the named maintainer) via Resend with: what failed, when, the error message (no secrets), and a link to System health.
- At most one alert per problem per day (store in a tiny `alerts` table or in run stats).
- Settings shows the alert email (masked) and "configured / not configured".
- Test: the "once per day" rule.

**DONE WHEN:** forcing a fake failure locally (e.g. an invalid source URL in a test) sends one alert, not several.

### Step 8 — Ship and verify live
1. Run all checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Scan for secrets. Commit with clear messages and push to `main` (Vercel redeploys).
2. Run migrations against production Neon with `npm run db:migrate` (safe and idempotent — **not** the integration tests).
3. Give me a checklist to verify on the live URL, and verify what you can yourself:
   - incognito: brief opens without a password;
   - `/api/cron/daily` returns **401** without the secret;
   - sign in → Generate report completes;
   - Settings → Send test email arrives;
   - Vercel → Settings → Cron Jobs → "Run" the weekly cron once; it succeeds and the email arrives (only once).
4. Do a quick manual pass at 390 px and 1440 px on every page; run one axe accessibility check on the brief, a month view and the login page; fix any AA violations.

**DONE WHEN:** every item on the checklist is ticked with real results.

### Step 9 — Final docs for submission
- `docs/COMPONENTS_MAP.md` + `docs/architecture.mmd`: match the final system — lanes **Sumit, Team (Neha · Kabir), Vercel Cron (Fri 06:00 IST), Pulse app, Platforms (HN · Stack Overflow · GitHub), Gemini Flash (Google AI Studio), Neon, Resend**; include the calendar, votes, email and alert flows. Note: Reddit pending approval; Discord and X not connected; calendar works on stored data. Validate the Mermaid.
- `README.md`: one-paragraph summary, live URL, how to run locally, env var list (names only), and a **"How to use it" section for examiners** (open URL → read brief → switch week/month → open evidence).
- `docs/LIVE_VERIFICATION.md`: add a "Production" section with real results from Step 8.
- `docs/NINE_CHECKS.md`: update #5 (votes/usefulness = measurable impact) and #9 (named maintainer gets alerts).
- Refresh `docs/screenshots/` with real data.
- Update `CLAUDE.md` status to "Final build shipped".

**DONE WHEN:** I have: live URL, GitHub URL, test results, and a plain list of known limitations.

---

## 6. Deliberately NOT building (keep it simple)

| Idea | Why it's cut |
|---|---|
| Pain-point rename/merge/split tool | Complex data migration; prompt `a2` already reduced fragmentation. Revisit after submission. |
| Sales-objection matching with Gemini | Nice-to-have, not required by the brief. Optional later as a manual "link objection → pain point" list. |
| Classifier `npm run eval` script | Hand-check of 15 items is already documented; not needed to ship. |
| Full Playwright + Lighthouse suite | Too heavy for this stage. Manual checklist + one axe run instead. |
| OpenRouter, Reddit, Discord, X | Direct Gemini works; Reddit awaits approval; others have no usable official API for this. |
| Auto-deciding the sprint | Sumit decides. The tool only suggests what to investigate (Nine Checks #7). |

## 7. Reporting after each step
- What I changed (files)
- How I tested it (commands and results)
- What you need to do (exact clicks), if anything
- What's next
