-- Failure alerts to the named maintainer (ALERT_EMAIL): at most one email per problem per day (IST).
-- key examples: 'run_failed:cron_daily', 'source_failing:github'. A failed send may be retried the same day.
create table if not exists public.alerts (
  key text not null,
  day date not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  subject text not null,
  error text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (key, day)
);
