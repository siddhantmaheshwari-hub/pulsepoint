-- One row per emailed Friday brief, so a brief is never emailed twice.
-- period_end is unique as well: a manual "Generate report" later in the week creates a new report version,
-- but the week's email has already gone out and is not sent again.
-- A failed send can be retried (by the Friday catch-up); a send stuck in 'sending' for 10+ minutes is treated as failed.
create table if not exists public.brief_emails (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  period_end timestamptz not null unique,
  recipients text not null,            -- comma-separated, as configured at send time
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz
);
