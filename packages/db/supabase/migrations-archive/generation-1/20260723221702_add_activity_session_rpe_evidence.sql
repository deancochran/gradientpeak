-- Immutable session-RPE evidence for completed activities. Corrections append a
-- replacement rather than mutating user, provider, or file-derived evidence.
create type public.activity_session_rpe_source as enum ('user', 'provider', 'manual');

create table public.activity_session_rpe_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  recorded_at timestamp with time zone not null,
  corrected_at timestamp with time zone,
  rpe integer not null,
  scale text not null,
  scale_version text not null,
  source public.activity_session_rpe_source not null,
  operation_id uuid not null,
  correction_of_id uuid,
  provenance jsonb not null,
  created_at timestamp with time zone not null default now(),
  constraint activity_session_rpe_evidence_id_activity_profile_unique
    unique (id, activity_id, profile_id),
  constraint activity_session_rpe_evidence_activity_profile_fkey
    foreign key (activity_id, profile_id)
    references public.activities(id, profile_id)
    on delete cascade,
  constraint activity_session_rpe_evidence_correction_same_activity_profile_fkey
    foreign key (correction_of_id, activity_id, profile_id)
    references public.activity_session_rpe_evidence(id, activity_id, profile_id)
    on delete restrict,
  constraint activity_session_rpe_evidence_rpe_bounds_check
    check (rpe between 1 and 10),
  constraint activity_session_rpe_evidence_scale_not_blank_check
    check (btrim(scale) <> ''),
  constraint activity_session_rpe_evidence_scale_version_not_blank_check
    check (btrim(scale_version) <> ''),
  constraint activity_session_rpe_evidence_correction_timestamp_check
    check ((correction_of_id is null) = (corrected_at is null)),
  constraint activity_session_rpe_evidence_correction_manual_check
    check (correction_of_id is null or source = 'manual'),
  constraint activity_session_rpe_evidence_provenance_object_check
    check (jsonb_typeof(provenance) = 'object')
);

create unique index activity_session_rpe_evidence_profile_operation_unique
  on public.activity_session_rpe_evidence(profile_id, operation_id);
create unique index activity_session_rpe_evidence_one_replacement_per_evidence_unique
  on public.activity_session_rpe_evidence(correction_of_id)
  where correction_of_id is not null;
create index idx_activity_session_rpe_evidence_activity_recorded
  on public.activity_session_rpe_evidence(activity_id, recorded_at, id)
  where correction_of_id is null;

alter table public.activity_session_rpe_evidence enable row level security;
grant all on table public.activity_session_rpe_evidence to service_role;

create function public.reject_activity_session_rpe_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'activity_session_rpe_evidence is immutable';
end;
$$;
revoke all on function public.reject_activity_session_rpe_evidence_mutation() from public;
grant execute on function public.reject_activity_session_rpe_evidence_mutation() to service_role;

create trigger activity_session_rpe_evidence_reject_update
before update on public.activity_session_rpe_evidence
for each row execute function public.reject_activity_session_rpe_evidence_mutation();

-- Deletion is deliberately left to the activity lifecycle's foreign-key cascade.
-- Authenticated and anonymous roles have no table grants or RLS policy, and the
-- application exposes no direct evidence-delete operation.
