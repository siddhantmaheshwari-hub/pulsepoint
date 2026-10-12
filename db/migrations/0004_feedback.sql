-- Sumit's "Useful / Not useful" rating of each AI finding, underserved explanation and recommendation in a brief.
-- Makes impact measurable (Nine Checks #5). One current rating per item; changing it updates the row.
create table if not exists public.finding_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  item_type text not null check (item_type in ('finding', 'underserved', 'recommendation')),
  item_index integer not null check (item_index >= 0),
  item_text text not null,             -- snapshot of what was rated, for later evaluation
  useful boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, item_type, item_index)
);
create index if not exists finding_feedback_report_idx on public.finding_feedback (report_id);
