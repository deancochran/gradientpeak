create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text,
  location_name text,
  route_id uuid references public.activity_routes(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_events_title_non_empty check (btrim(title) <> ''),
  constraint group_events_time_window check (ends_at is null or ends_at > starts_at),
  constraint group_events_timezone_non_empty check (timezone is null or btrim(timezone) <> ''),
  constraint group_events_location_name_non_empty check (
    location_name is null or btrim(location_name) <> ''
  )
);

create index if not exists group_events_group_starts_at_idx
  on public.group_events (group_id, starts_at);

create index if not exists group_events_group_cancelled_starts_at_idx
  on public.group_events (group_id, cancelled_at, starts_at);

create table if not exists public.group_event_activity_plans (
  id uuid primary key default gen_random_uuid(),
  group_event_id uuid not null references public.group_events(id) on delete cascade,
  activity_plan_id uuid not null references public.activity_plans(id) on delete cascade,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint group_event_activity_plans_event_plan_unique unique (group_event_id, activity_plan_id),
  constraint group_event_activity_plans_sort_order_check check (sort_order >= 0),
  constraint group_event_activity_plans_label_non_empty check (label is null or btrim(label) <> '')
);

create index if not exists group_event_activity_plans_event_sort_idx
  on public.group_event_activity_plans (group_event_id, sort_order);

create table if not exists public.group_event_rsvps (
  group_event_id uuid not null references public.group_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted',
  selected_group_event_activity_plan_id uuid references public.group_event_activity_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_event_id, profile_id),
  constraint group_event_rsvps_status_check check (status in ('accepted', 'declined'))
);

create index if not exists group_event_rsvps_profile_status_idx
  on public.group_event_rsvps (profile_id, status);
