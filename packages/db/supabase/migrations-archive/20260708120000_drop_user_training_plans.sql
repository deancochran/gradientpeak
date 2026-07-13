drop index if exists public.idx_events_user_training_plan;
drop index if exists public.idx_event_schedule_links_user_training_plan_id;

alter table if exists public.event_schedule_links
  drop constraint if exists event_schedule_links_user_training_plan_id_user_training_plans_id_fk;

alter table if exists public.events
  drop constraint if exists events_user_training_plan_id_user_training_plans_id_fk;

alter table if exists public.event_schedule_links
  drop column if exists user_training_plan_id;

alter table if exists public.events
  drop column if exists user_training_plan_id;

drop table if exists public.user_training_plans;
