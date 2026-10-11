# Failure modes of social listening & developer-sentiment tools — and how this design responds

Findings are split into **verified (sourced)** and **design recommendations (ours)**.

## Verified findings

1. **General-purpose sentiment tools are unreliable on developer text.** Novielli, Calefato, Lanubile & Serebrenik (Empirical Software Engineering, 2021) note that general-purpose tools trained on non-technical text such as product reviews produce unreliable results in software engineering contexts, and that even SE-specific tools used off-the-shelf can reach contradictory conclusions at a fine-grained level; platform-specific tuning may be needed for differences in conventions, jargon and document length. https://arxiv.org/abs/2010.10172
2. **The tool choice itself threatens conclusion validity.** A SANER 2024 replication on Stack Overflow security questions found that retraining with identical data did not fix inconsistencies in how some language (e.g. courtesy phrases) is classified. https://research.tue.nl/en/publications/sentiment-of-technical-debt-security-questions-on-stack-overflow-/
3. **LLM citations are claims, not proof.** Recent work on grounded generation finds models can attach a citation to a source that does not support the claim, and recommends post-hoc verification that the cited source actually supports the statement. https://kodekloud.com/blog/ground-llm-answers-with-citations/ · https://arxiv.org/html/2603.07287v1

## Design recommendations (ours, informed by the above)

| Failure mode | Why it happens | Response in this build |
|---|---|---|
| Keyword monitoring confuses debugging noise with product pain | "flaky tests" matches thousands of single-setup errors | Classifier separates `isolated_bug` and `how_to_question` from `workflow_pain` / `unmet_need`; only the latter count toward frequency; bugs shown separately |
| Sentiment ≠ actionable pain; jargon & sarcasm | Polarity models misread "kill the build" | No sentiment score at all. Extraction targets pain point, affected workflow, impact, workaround, resolution |
| Duplicates & cross-posts inflate trends | Same thread matched by several keywords; mirrored posts | Unit = unique discussion; HN comments folded into their thread; unique (source, external_id); content fingerprint flags cross-source duplicates |
| Keyword mentions mistaken for discussion volume | One long thread repeats a phrase 30 times | Mentions stored separately in `discussion_matches` and displayed as their own figure |
| Inconsistent coverage distorts trends | Source outages, new keywords, rate limits | 3-day overlap on daily runs; 15-day backfill per new keyword; source failures and keyword changes surfaced in data quality |
| Missing history | Trend tools start blind | Backfill gives a previous week on day one; every report stored immutably with config snapshot and analysis version; revisions to the prior week are disclosed |
| Unsupported AI summaries | Models invent or misattribute | Numbers computed by code only; quotes verified verbatim or hidden; synthesis must cite supplied evidence IDs or the claim is deleted (count shown) |
| Fragmented taxonomy | LLM names the same problem differently each week | Pain-point catalog passed into every prompt with instruction to reuse keys; keys normalized to kebab-case |
| Isolated bug vs recurring problem | Single loud thread looks like a trend | Trend needs ≥2 discussions and ≥25%; sufficiency labels; "underserved" requires ≥2 discussions with ≥50% unresolved |
