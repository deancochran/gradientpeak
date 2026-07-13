alter table public.profile_estimation_state
  add column if not exists dirty_since timestamptz;

alter table public.activity_efforts
  drop constraint if exists activity_efforts_activity_id_activities_id_fk;

alter table public.activity_efforts
  add constraint activity_efforts_activity_id_activities_id_fk
  foreign key (activity_id)
  references public.activities(id)
  on delete cascade;
