create table if not exists public.profile_plans (
    id uuid primary key default uuid_generate_v4(),
    idx serial not null unique,
    profile_id uuid not null references public.profiles(id) on delete cascade,

    name text not null,
    description text,
    config jsonb not null,

    created_at timestamp not null default now()
);

-- Enums
create type activity_type as enum (
    'bike',
    'run',
    'swim',
    'strength',
    'other'
);

-- Table
create table if not exists public.planned_activities (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique,
    profile_plan_id uuid references public.profile_plans(id) on delete set null,
    completed_activity_id uuid,
    scheduled_date date not null,
    name text not null,
    activity_type activity_type not null,
    description text,
    structure jsonb not null,
    estimated_duration integer,
    estimated_distance integer,
    estimated_tss integer,
    created_at timestamp not null default now()
);
