delete from public.events as e
where exists (
  select 1
  from public.profile_goals as pg
  where pg.milestone_event_id = e.id
);

alter table public.profile_goals
  drop constraint if exists profile_goals_milestone_event_id_events_id_fk;

drop index if exists public.idx_profile_goals_milestone_event_id;

alter table public.profile_goals
  drop column if exists milestone_event_id;
