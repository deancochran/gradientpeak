begin;

create table public.training_plan_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete restrict,
  source_revision integer not null check (source_revision > 0),
  start_date date not null,
  planning_timezone text not null check (btrim(planning_timezone) <> ''),
  application_revision integer not null default 1 check (application_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profile_id),
  unique (id, profile_id, training_plan_id)
);
create index training_plan_applications_profile_plan_idx
  on public.training_plan_applications(profile_id, training_plan_id, created_at);

create table public.training_plan_application_command_receipts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  command text not null check (command in ('apply', 'update', 'remove')),
  request_fingerprint text not null check (request_fingerprint ~ '^v1:sha256:[0-9a-f]{64}$'),
  application_id uuid,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (profile_id, operation_id),
  check (operation_id ~ '^[A-Za-z0-9_-]{32,128}$'),
  constraint training_plan_application_command_receipts_application_owner_fkey
    foreign key (application_id, profile_id)
    references public.training_plan_applications(id, profile_id) on delete restrict
);
create index training_plan_application_command_receipts_application_idx
  on public.training_plan_application_command_receipts(application_id);

alter table public.training_plan_applications enable row level security;
alter table public.training_plan_application_command_receipts enable row level security;
revoke all on table public.training_plan_applications from anon, authenticated;
revoke all on table public.training_plan_application_command_receipts from anon, authenticated;

alter table public.planned_sessions add column training_plan_application_id uuid;

-- The pre-application immutable-source trigger necessarily rejects the
-- provenance key rewrite below. Replace its function first so the reinstalled
-- guard includes application identity, then suspend only this trigger while
-- this transaction holds the table write fence.
create or replace function public.prevent_planned_session_prescription_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id
    or new.contract_version is distinct from old.contract_version
    or new.original_target_date is distinct from old.original_target_date
    or new.source_kind is distinct from old.source_kind
    or new.idempotency_key is distinct from old.idempotency_key
    or new.direct_operation_id is distinct from old.direct_operation_id
    or new.training_plan_id is distinct from old.training_plan_id
    or new.training_plan_revision is distinct from old.training_plan_revision
    or new.training_plan_application_id is distinct from old.training_plan_application_id
    or new.source_session_id is distinct from old.source_session_id
    or new.activity_plan_id is distinct from old.activity_plan_id
    or new.activity_plan_revision is distinct from old.activity_plan_revision
    or new.resolution_manifest is distinct from old.resolution_manifest
    or new.prescription_captured_at is distinct from old.prescription_captured_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'planned session prescription and source fields are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_planned_session_prescription_mutation() from public;
revoke all on function public.prevent_planned_session_prescription_mutation() from anon;
revoke all on function public.prevent_planned_session_prescription_mutation() from authenticated;
revoke all on function public.prevent_planned_session_prescription_mutation() from service_role;

lock table public.planned_sessions in share row exclusive mode;
drop trigger planned_sessions_prescription_immutable on public.planned_sessions;
alter table public.planned_sessions drop constraint planned_sessions_source_check;

-- Backfill only groups with a proven shared anchor: every source session's
-- stored calendar date must equal one common date offset from its weekday.
-- A group that cannot prove this relation deliberately remains legacy/null.
with mapped as (
  select
    ps.profile_id,
    ps.training_plan_id,
    ps.training_plan_revision,
    ps.planning_date - ((source.value->>'offset_days')::integer) as anchor_date
  from public.planned_sessions ps
  join public.training_plans tp
    on tp.id = ps.training_plan_id
    and tp.revision = ps.training_plan_revision
  join lateral jsonb_array_elements(tp.structure->'sessions') source(value)
    on source.value->>'id' = ps.source_session_id::text
  where ps.source_kind = 'training_plan'
    and ps.training_plan_application_id is null
), candidates as (
  select m.profile_id, m.training_plan_id, m.training_plan_revision,
    min(m.anchor_date)::date as start_date
  from mapped m
  group by m.profile_id, m.training_plan_id, m.training_plan_revision
  having min(m.anchor_date) = max(m.anchor_date)
    and count(*) = (
      select count(*) from public.planned_sessions ps
      where ps.profile_id = m.profile_id
        and ps.training_plan_id = m.training_plan_id
        and ps.training_plan_revision = m.training_plan_revision
        and ps.source_kind = 'training_plan'
        and ps.training_plan_application_id is null
    )
), inserted as (
  insert into public.training_plan_applications (
    profile_id, training_plan_id, source_revision, start_date, planning_timezone
  )
  select c.profile_id, c.training_plan_id, c.training_plan_revision, c.start_date,
    p.planning_timezone
  from candidates c
  join public.profiles p on p.id = c.profile_id
  join pg_timezone_names tz on tz.name = p.planning_timezone
  returning id, profile_id, training_plan_id, source_revision
)
update public.planned_sessions ps
set training_plan_application_id = inserted.id,
    idempotency_key = 'training-plan:' || inserted.id::text || ':' || ps.training_plan_revision::text || ':' || ps.source_session_id::text
from inserted
where ps.profile_id = inserted.profile_id
  and ps.training_plan_id = inserted.training_plan_id
  and ps.training_plan_revision = inserted.source_revision
  and ps.training_plan_application_id is null;

alter table public.planned_sessions
  add constraint planned_sessions_application_source_fkey
  foreign key (training_plan_application_id, profile_id, training_plan_id)
  references public.training_plan_applications(id, profile_id, training_plan_id) on delete restrict;

alter table public.planned_sessions add constraint planned_sessions_source_check check (
  (source_kind = 'direct' and direct_operation_id ~ '^[A-Za-z0-9_-]{32,128}$'
    and idempotency_key = 'direct:' || direct_operation_id
    and num_nonnulls(training_plan_id, training_plan_revision, training_plan_application_id, source_session_id) = 0)
  or
  (source_kind = 'training_plan' and training_plan_id is not null and training_plan_revision > 0
    and source_session_id is not null and direct_operation_id is null
    and ((training_plan_application_id is not null
      and idempotency_key = 'training-plan:' || training_plan_application_id::text || ':' || training_plan_revision::text || ':' || source_session_id::text)
      or (training_plan_application_id is null
        and idempotency_key = 'training-plan:' || training_plan_id::text || ':' || training_plan_revision::text || ':' || source_session_id::text)))
);
create trigger planned_sessions_prescription_immutable
before update on public.planned_sessions
for each row execute function public.prevent_planned_session_prescription_mutation();
create index planned_sessions_application_status_date_idx
  on public.planned_sessions(training_plan_application_id, profile_id, status, planning_date, id)
  where training_plan_application_id is not null;

commit;
