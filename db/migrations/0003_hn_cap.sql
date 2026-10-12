-- Live verification (Phase 1): 25 threads per keyword saturated busy keywords like "code review"
-- (~150 matching HN items in 15 days). A capped one-shot backfill undercounts last week relative to
-- daily-collected weeks and produces false "rising" trends, so use the adapter's maximum.
update public.sources
set config = jsonb_set(config, '{maxItemsPerKeyword}', '100'::jsonb)
where id = 'hackernews' and (config->>'maxItemsPerKeyword')::int < 100;
