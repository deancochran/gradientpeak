alter table public.group_events
  add column if not exists series_id uuid references public.group_events(id) on delete cascade,
  add column if not exists recurrence_rule text,
  add column if not exists recurrence_timezone text,
  add column if not exists occurrence_key text;

alter table public.group_events
  drop constraint if exists group_events_title_non_empty;

alter table public.group_events
  alter column title drop not null;

alter table public.group_events
  add constraint group_events_title_non_empty check (title is null or btrim(title) <> ''),
  add constraint group_events_root_title_required check (series_id is not null or title is not null),
  add constraint group_events_series_not_self check (series_id is null or series_id <> id),
  add constraint group_events_recurrence_rule_non_empty check (
    recurrence_rule is null or btrim(recurrence_rule) <> ''
  ),
  add constraint group_events_recurrence_timezone_non_empty check (
    recurrence_timezone is null or btrim(recurrence_timezone) <> ''
  ),
  add constraint group_events_recurrence_timezone_requires_rule check (
    recurrence_timezone is null or recurrence_rule is not null
  ),
  add constraint group_events_recurring_series_timezone_required check (
    recurrence_rule is null or timezone is not null
  ),
  add constraint group_events_occurrence_key_required check (
    series_id is null or (occurrence_key is not null and btrim(occurrence_key) <> '')
  );

create unique index if not exists group_events_series_occurrence_unique_idx
  on public.group_events (series_id, occurrence_key)
  where series_id is not null;

create index if not exists group_events_series_starts_at_idx
  on public.group_events (series_id, starts_at)
  where series_id is not null;

create table if not exists public.group_event_series_rsvps (
  group_event_series_id uuid not null references public.group_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_event_series_id, profile_id),
  constraint group_event_series_rsvps_status_check check (status in ('accepted', 'declined'))
);

create index if not exists group_event_series_rsvps_profile_status_idx
  on public.group_event_series_rsvps (profile_id, status);
