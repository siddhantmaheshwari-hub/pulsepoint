# The Nine Checks — PulsePoint

Framework: AI Basics, page 32. **Kill switches** (1–3): any NO → don't build in this form. **Sizing** (4–5): any NO → build something smaller. **Boundary** (6–9): any NO → put a human exactly here.

## Overall recommendation

**Build — at reduced scope, with two named human boundaries.**
No kill switch fails. Check 4 is only partially proven, so v1 is deliberately smaller (two sources, directional trends with sufficiency labels, recommendations framed as "investigate", no automated actions). Check 9 failed as first stated, so a human was placed exactly there: a named maintainer now receives failure alerts by email (final build), alongside Sumit as owner of taxonomy and decisions.

| # | Check | Verdict | Consequence |
|---|---|---|---|
| 1 | Problem real? | YES | Proceed |
| 2 | Workflow repeated? | YES | Proceed |
| 3 | Input available? | YES (HN, Stack Overflow, GitHub Issues) | Reddit pending approval; Discord and X not connected |
| 4 | Output valuable? | PARTIAL → treated as NO | Build smaller |
| 5 | Impact measurable? | YES — measured in-app | Team votes 👍/👎 on every AI item; usefulness rate on Weekly reports |
| 6 | Failure risk OK? | YES with human review | Human reviews evidence before acting |
| 7 | Judgment protected? | YES by design | AI surfaces, Sumit decides |
| 8 | ROI worth it? | YES | Proceed (note hosting plan cost) |
| 9 | Owner clear? | YES — named maintainer | Failure alerts emailed to ALERT_EMAIL; Sumit owns keywords and decisions |

---

### 1. Problem real? — Kill switch
- **Purpose:** Is there a genuine, felt problem, not a solution looking for one?
- **Evidence:** Sumit spends ~90 min every Friday searching 2–3 communities; notes go into an unstructured doc; he cannot tell whether "false positive rate" appeared 4 or 14 times or whether it's growing. His last user interviews were ~6 months ago, so real-time signal is otherwise missing.
- **Verdict:** **YES.**
- **Reasoning:** The pain is time, inconsistency, and the absence of any week-over-week comparison — all three are concrete and stated by the user.
- **Risks:** Evidence is self-reported by a single PM; the "real" problem may be confidence in roadmap decisions rather than search time.
- **Safeguards:** Brief shows evidence links so Sumit can verify rather than trust.
- **Evidence still required:** After 3 weeks, does Sumit stop doing the manual search? If he keeps doing both, the problem was mis-framed.

### 2. Workflow repeated? — Kill switch
- **Purpose:** Does the same workflow recur often enough to automate?
- **Evidence:** Weekly, same day, same three questions (frequency, trend, unresolved), same problem space.
- **Verdict:** **YES.**
- **Reasoning:** A fixed cadence with a fixed deliverable is the ideal shape for a scheduled pipeline.
- **Risks:** The monitored vocabulary drifts as the product evolves.
- **Safeguards:** Topics/keywords live in the Neon database and are editable from the UI; new keywords are backfilled 15 days so comparisons stay fair; keyword changes are flagged in the brief.
- **Evidence still required:** None blocking.

### 3. Input available? — Kill switch
- **Purpose:** Can the system legitimately get the data it needs?
- **Evidence:** Hacker News (Algolia API, no key) and Stack Exchange API (no key; 300 req/day, 10k with a free key) are official, free, and support date filters — enabling a 15-day backfill on day one. GitHub Issues search works with a token but is dominated by repo-specific bug reports. Reddit's API requires OAuth registration and its terms restrict commercial use, so it is not used in v1.
- **Verdict:** **YES — HN and Stack Overflow from v1; GitHub Issues enabled in the final build** (read-only token; 65 new threads in its first 3-day collection, 17 describing workflow pain). Reddit is pending API approval; Discord and X are not connected.
- **Reasoning:** Reliable official sources are enough to pass the kill switch for a reduced v1.
- **Risks:** Sumit's actual "two or three communities" are not named; if they are Reddit, Discord or private Slacks, coverage is materially incomplete. Stack Overflow skews to how-to questions (debugging noise).
- **Safeguards:** Classifier separates how-to questions and isolated bugs from workflow pain; per-source counts and filters expose source bias; source failures are surfaced in data quality.
- **Evidence still required:** Confirm with Sumit which communities he reads; measure weekly volume of *relevant pain* discussions after week 1 (if consistently < ~20, trend claims stay weak).

### 4. Output valuable? — Sizing
- **Purpose:** Is the output worth having, at the size proposed?
- **Evidence:** Frequency + evidence links clearly replace the manual reading. But week-over-week trends on small counts are statistically fragile (a move from 2 to 4 is "+100%").
- **Verdict:** **PARTIAL → treated as NO under the rule → build smaller.**
- **Reasoning:** The evidence digest is clearly valuable; precise trend claims are not yet proven at expected volumes.
- **Scope reductions made:** (a) trends require both ≥2 discussions and ≥25% change, else "stable"; (b) every pain point carries a sufficiency label (insufficient < 3 total, limited < 8 or single source); (c) zero baselines show "New", never a percentage; (d) AI recommendations are "areas to investigate", not priorities; (e) no automated ticket creation; the brief is emailed to the team as a reading, never as the plan.
- **Risks:** Sumit over-reads a "rising" label on thin data.
- **Evidence still required:** Sumit rates each brief's findings useful / not useful for 4 weeks.

### 5. Impact measurable? — Sizing
- **Purpose:** Can we tell whether it worked?
- **Evidence:** Baseline is explicit (90 min/week). Measurable outcomes: review time per brief, number of findings that enter sprint discussion, demo objections that match a tracked pain point.
- **Verdict:** **YES — measured in-app (final build).**
- **How it is measured now:** Sumit, Neha and Kabir each vote 👍 Useful / 👎 Not useful once on every AI finding, underserved explanation and recommendation (`finding_feedback`, one vote per person per item). *Weekly reports* shows the usefulness rate across all voters and per brief, so value is tracked week by week instead of relying on Sumit's notes.
- **Risks:** No sign-in in the testing build, so a vote's name is self-chosen; a handful of votes per week is a small sample.
- **Safeguards:** Every report is stored as an immutable snapshot, so votes always refer to exactly what was shown; later evaluation can compare what was said vs. what happened.
- **Evidence still required:** Week-1 baseline (time on the brief vs. the old 90-minute manual process) and 4 weeks of votes.

### 6. Failure risk OK? — Boundary
- **Purpose:** What is the worst plausible failure, and is it acceptable?
- **Evidence:** Worst cases: a false trend nudges sprint priorities; a misclassified thread hides a real pain; an AI summary invents a claim.
- **Verdict:** **YES — with the human placed at review.**
- **Reasoning:** Failures are recoverable and the output is advisory.
- **Safeguards:** Numbers computed by code only; quotes shown only when verified verbatim against the source; uncited AI statements are deleted before display; confidence, coverage, source failures and late-data revisions are shown on the brief.
- **Human here:** Sumit opens the linked discussions before acting on any finding.

### 7. Judgment protected? — Boundary
- **Purpose:** Does the human keep the decisions that require judgment?
- **Verdict:** **YES — by design.**
- **Reasoning:** The system narrows and evidences; Sumit decides what matters for Monday's sprint planning.
- **Killed by 07:** "Auto-create roadmap tickets from rising pain points." "Rank the backlog automatically." "Send the brief straight to the whole company as the plan." Each would move prioritisation away from Sumit.

### 8. ROI worth it? — Boundary
- **Purpose:** Does value exceed build + run cost?
- **Evidence:** Run cost: Gemini Flash on a few hundred discussions/week (≈30–60 calls) is small; Neon free tier is sufficient. Saves ~78 hours/year of PM time plus better-quality signal. Build: days, not weeks.
- **Verdict:** **YES.**
- **Risks:** Vercel's Hobby plan is for non-commercial use — a startup's internal tool should run on Pro (~$20/month). API changes require maintenance.
- **Evidence still required:** Actual Gemini usage after 4 weeks (visible in Google AI Studio).

### 9. Owner clear? — Boundary
- **Purpose:** Is there a clear owner for inputs, operation and decisions?
- **Evidence:** Sumit clearly owns the keyword taxonomy and the decisions. Nobody is named to own pipeline health (a source API change, an expired key, a quota hit) in a 15-person startup where Sumit is not an engineer by role.
- **Verdict (as first assessed):** **NO (for operations) → put a human exactly here.**
- **Human here (final build):** A **named maintainer** is set in `ALERT_EMAIL` and is emailed automatically when a scheduled run fails or a source fails 3 runs in a row — what failed, when, the error (secrets redacted) and a link to System health — at most once per problem per day. The maintainer reviews System health; Sumit owns topics/keywords and all prioritisation. **Verdict now: YES.**
- **Evidence:** A forced failure (invalid source URL) produced exactly one alert email; repeats the same day were suppressed (see `docs/LIVE_VERIFICATION.md`).
- **Remaining gap:** On Resend's free plan alerts reach only the account owner until a domain is verified.
