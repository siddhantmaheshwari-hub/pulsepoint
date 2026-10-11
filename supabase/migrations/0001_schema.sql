-- Developer Community Pulse — core schema
create extension if not exists pgcrypto;

-- Monitored configuration ----------------------------------------------------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (length(name) between 2 and 80),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  term text not null check (length(term) between 2 and 80),
  is_active boolean not null default true,
  backfilled_at timestamptz,            -- null => next collection looks back 15 days
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists keywords_topic_term_uq on public.keywords (topic_id, lower(term));
create index if not exists keywords_active_idx on public.keywords (is_active);

create table if not exists public.sources (
  id text primary key check (id in ('hackernews','stackoverflow','github')),
  name text not null,
  base_url text not null,
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb
);

-- Collection runs -------------------------------------------------------------
create table if not exists public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron_daily','cron_weekly','manual')),
  mode text not null check (mode in ('collect','report','full')),
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  config_snapshot jsonb not null default '{}'::jsonb,
  report_id uuid
);
create index if not exists collection_runs_started_idx on public.collection_runs (started_at desc);

-- Discussions (one row per thread/question/issue) -------------------------------
create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id),
  external_id text not null,
  url text not null,
  title text not null,
  body_excerpt text not null default '',
  author text,
  created_at_source timestamptz not null,   -- first matching activity (bucketing date)
  last_activity_at timestamptz not null,
  score integer,
  comment_count integer,
  tags text[] not null default '{}',
  source_meta jsonb not null default '{}'::jsonb,
  content_fingerprint text not null,
  duplicate_of uuid references public.discussions(id) on delete set null,
  first_seen_run_id uuid references public.collection_runs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  analysis_status text not null default 'pending' check (analysis_status in ('pending','done','failed','skipped')),
  analysis_attempts integer not null default 0,
  unique (source_id, external_id)
);
create index if not exists discussions_created_idx on public.discussions (created_at_source desc);
create index if not exists discussions_status_idx on public.discussions (analysis_status) where duplicate_of is null;
create index if not exists discussions_fingerprint_idx on public.discussions (content_fingerprint);

-- Keyword mentions (distinct from unique discussion counts)
create table if not exists public.discussion_matches (
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  term_snapshot text not null,
  mention_count integer not null check (mention_count >= 0),
  primary key (discussion_id, keyword_id)
);
create index if not exists discussion_matches_topic_idx on public.discussion_matches (topic_id);

-- AI analysis -----------------------------------------------------------------
create table if not exists public.pain_points (
  key text primary key check (key ~ '^[a-z0-9-]{3,60}$'),
  label text not null,
  description text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.discussion_analyses (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  analysis_version text not null,
  model text not null,
  is_relevant boolean not null,
  kind text not null check (kind in ('workflow_pain','unmet_need','isolated_bug','how_to_question','opinion','not_relevant')),
  pain_point_key text references public.pain_points(key),
  topic_slug text,
  affected_workflow text,
  reported_impact text,
  existing_workaround text,
  tools_mentioned text[] not null default '{}',
  resolution_status text not null check (resolution_status in ('unresolved','partially_resolved','resolved','unknown')),
  evidence_quote text,
  evidence_verified boolean not null default false,
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (discussion_id, analysis_version)
);
create index if not exists analyses_key_idx on public.discussion_analyses (pain_point_key);

-- Reports & historical snapshots ------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  prev_period_start timestamptz not null,
  prev_period_end timestamptz not null,
  version integer not null default 1,
  trigger text not null check (trigger in ('cron_weekly','manual')),
  status text not null check (status in ('complete','complete_without_synthesis')),
  generated_at timestamptz not null default now(),
  run_id uuid references public.collection_runs(id) on delete set null,
  totals jsonb not null,          -- deterministic counts
  synthesis jsonb,                -- AI findings (validated, evidence-linked)
  data_quality jsonb not null,
  config_snapshot jsonb not null,
  analysis_version text not null,
  model text,
  unique (period_end, version)
);
create index if not exists reports_period_idx on public.reports (period_end desc, version desc);

create table if not exists public.topic_metrics (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  pain_point_key text not null references public.pain_points(key),
  label text not null,
  topic_slug text,
  current_count integer not null check (current_count >= 0),
  previous_count integer not null check (previous_count >= 0),
  abs_change integer not null,
  pct_change numeric(8,1),        -- null when previous_count = 0
  trend text not null check (trend in ('rising','declining','stable','new','gone','none')),
  distinct_sources integer not null,
  by_source jsonb not null,       -- {source: {current, previous}}
  first_observed timestamptz,
  last_observed timestamptz,
  unresolved_count integer not null,
  bug_reports integer not null default 0,
  avg_confidence numeric(3,2),
  verified_share numeric(3,2),
  sufficiency text not null check (sufficiency in ('sufficient','limited','insufficient')),
  underserved boolean not null default false,
  evidence jsonb not null default '[]'::jsonb,
  unique (report_id, pain_point_key)
);
create index if not exists topic_metrics_key_idx on public.topic_metrics (pain_point_key);

-- Lock everything down: the browser never talks to Supabase directly.
-- All access goes through server code using the service role key, which bypasses RLS.
alter table public.topics enable row level security;
alter table public.keywords enable row level security;
alter table public.sources enable row level security;
alter table public.collection_runs enable row level security;
alter table public.discussions enable row level security;
alter table public.discussion_matches enable row level security;
alter table public.pain_points enable row level security;
alter table public.discussion_analyses enable row level security;
alter table public.reports enable row level security;
alter table public.topic_metrics enable row level security;
-- (No policies for anon/authenticated => no access with the public anon key.)
