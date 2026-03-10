drop trigger if exists update_profile_goals_updated_at on public.profile_goals;

drop table if exists public.profile_goals;

create table public.profile_goals (
    id uuid primary key default uuid_generate_v4(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    milestone_event_id uuid not null references public.events(id) on delete cascade,
    title text not null,
    priority integer not null default 5 check (priority >= 0 and priority <= 10),
    activity_category text,
    target_payload jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profile_goals_profile_id
    on public.profile_goals(profile_id);

create index if not exists idx_profile_goals_milestone_event_id
    on public.profile_goals(milestone_event_id);

create trigger update_profile_goals_updated_at
    before update on public.profile_goals
    for each row
    execute function public.update_updated_at_column();

alter table public.profile_goals disable row level security;
