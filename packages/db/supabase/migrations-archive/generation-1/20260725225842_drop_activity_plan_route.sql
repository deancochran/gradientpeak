-- Destructive hard cut: activity plans are structured workouts; routes belong to events.
alter table public.activity_plans
  drop constraint if exists activity_plans_route_id_activity_routes_id_fk;

drop index if exists public.idx_activity_plans_route_id;

alter table public.activity_plans
  drop column if exists route_id;
