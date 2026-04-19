create table if not exists public.activity_plan_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  queued_at timestamp with time zone not null default now(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_plan_id uuid not null references public.activity_plans(id) on delete cascade
);

create unique index if not exists activity_plan_refresh_queue_profile_plan_unique
on public.activity_plan_refresh_queue (profile_id, activity_plan_id);

create index if not exists idx_activity_plan_refresh_queue_profile_queued_at
on public.activity_plan_refresh_queue (profile_id, queued_at);
