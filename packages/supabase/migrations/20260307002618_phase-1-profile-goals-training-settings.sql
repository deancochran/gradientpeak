alter table public.training_plans
    add column if not exists is_public boolean not null default false,
    add column if not exists sessions_per_week_target integer,
    add column if not exists duration_hours numeric;

create table if not exists public.profile_training_settings (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

drop trigger if exists update_profile_training_settings_updated_at on public.profile_training_settings;

create trigger update_profile_training_settings_updated_at
    before update on public.profile_training_settings
    for each row
    execute function public.update_updated_at_column();

create table if not exists public.profile_goals (
    id uuid primary key default extensions.uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    training_plan_id uuid references public.training_plans(id) on delete set null,
    milestone_event_id uuid references public.events(id) on delete set null,
    title text not null,
    goal_type text not null,
    target_metric text,
    target_value numeric,
    importance integer not null default 5 check (importance >= 0 and importance <= 10),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_profile_goals_profile_id
    on public.profile_goals(profile_id);

create index if not exists idx_profile_goals_training_plan_id
    on public.profile_goals(training_plan_id)
    where training_plan_id is not null;

create index if not exists idx_profile_goals_milestone_event_id
    on public.profile_goals(milestone_event_id)
    where milestone_event_id is not null;

drop trigger if exists update_profile_goals_updated_at on public.profile_goals;

create trigger update_profile_goals_updated_at
    before update on public.profile_goals
    for each row
    execute function public.update_updated_at_column();

alter table public.profile_goals disable row level security;
alter table public.profile_training_settings disable row level security;
