-- Destructive hard cut: events own route/plan association; activity plans own structured workouts only.
-- Data loss is intentional per docs/product/specs/event-route-plan-hard-cut.md.

truncate table public.events, public.activity_plans, public.group_events cascade;

alter table public.activity_plans
  drop constraint if exists activity_plans_has_content,
  drop constraint if exists activity_plans_route_id_activity_routes_id_fk,
  drop column if exists route_id,
  alter column structure set not null;

drop index if exists public.idx_activity_plans_route_id;

alter table public.group_events
  add column if not exists activity_plan_id uuid references public.activity_plans(id) on delete set null;

create index if not exists idx_group_events_activity_plan_id
  on public.group_events(activity_plan_id)
  where activity_plan_id is not null;

alter table public.group_event_rsvps
  drop constraint if exists group_event_rsvps_selected_group_event_activity_plan_id_group_event_activity_plans_id_fk,
  drop column if exists selected_group_event_activity_plan_id;

drop index if exists public.idx_group_event_rsvps_selected_activity_plan_id;
drop table if exists public.group_event_activity_plans;

alter type public.event_type rename to event_type_old;
create type public.event_type as enum ('planned', 'race_target', 'custom', 'imported');

alter table public.events
  alter column event_type drop default,
  alter column event_type type public.event_type using (
    case event_type::text
      when 'planned_activity' then 'planned'
      when 'race' then 'race_target'
      when 'custom' then 'custom'
      when 'imported' then 'imported'
      else 'custom'
    end
  )::public.event_type;

drop type public.event_type_old;
