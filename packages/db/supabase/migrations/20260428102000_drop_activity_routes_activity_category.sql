drop index if exists public.idx_routes_activity_category;

alter table public.activity_routes
  drop column if exists activity_category;
