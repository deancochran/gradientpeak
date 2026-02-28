-- Hard cutover: remove legacy activity location semantics

drop index if exists public.idx_activities_activity_location;

drop index if exists public.idx_activities_location;

alter table public.activity_plans
  drop column if exists activity_location;

alter table public.activities
  drop column if exists location;

drop type if exists public.activity_location;
