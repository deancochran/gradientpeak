create table if not exists public.synced_events (
    id uuid primary key default uuid_generate_v4(),
    idx serial unique not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    event_id uuid not null references public.events(id) on delete cascade,
    provider public.integration_provider not null,
    external_id text not null,
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint unique_event_per_provider unique (event_id, provider)
);

create index if not exists idx_synced_events_profile
    on public.synced_events(profile_id);

create index if not exists idx_synced_events_event
    on public.synced_events(event_id);

create index if not exists idx_synced_events_provider
    on public.synced_events(provider, external_id);

drop trigger if exists update_synced_events_updated_at on public.synced_events;

create trigger update_synced_events_updated_at
    before update on public.synced_events
    for each row
    execute function public.update_updated_at_column();

alter table public.synced_events disable row level security;

insert into public.synced_events as synced_events (
    profile_id,
    event_id,
    provider,
    external_id,
    synced_at,
    created_at,
    updated_at
)
select
    synced_planned.profile_id,
    events.id as event_id,
    synced_planned.provider,
    synced_planned.external_id,
    synced_planned.synced_at,
    synced_planned.created_at,
    synced_planned.updated_at
from public.synced_planned_activities as synced_planned
inner join public.events as events
    on events.id = synced_planned.planned_activity_id
on conflict (event_id, provider) do update
set
    profile_id = excluded.profile_id,
    external_id = excluded.external_id,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;
