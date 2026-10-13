-- Team votes: each teammate (TEAM_MEMBERS, default Sumit, Neha, Kabir) votes once per item.
-- Existing ratings were Sumit's, so they keep the default voter.
alter table public.finding_feedback add column if not exists voter text not null default 'Sumit';
alter table public.finding_feedback drop constraint if exists finding_feedback_report_id_item_type_item_index_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'finding_feedback_one_vote_per_voter') then
    alter table public.finding_feedback add constraint finding_feedback_one_vote_per_voter unique (report_id, item_type, item_index, voter);
  end if;
end $$;
