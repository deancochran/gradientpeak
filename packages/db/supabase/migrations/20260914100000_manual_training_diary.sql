begin;

alter table public.activities
  add column entry_provenance text,
  add column manual_activity_category public.activity_category,
  add column diary_date date,
  add column diary_timezone text,
  add column superseded_by_activity_id uuid,
  add column superseded_at timestamptz,
  add column reconciliation_operation_id uuid,
  add column reconciled_planned_session_id uuid,
  alter column started_at drop not null,
  alter column finished_at drop not null,
  alter column elapsed_ms drop not null,
  alter column distance_meters drop not null;

alter table public.activities drop constraint activities_distance_meters_check;
alter table public.activities add constraint activities_distance_meters_check
  check (distance_meters is null or distance_meters >= 0);
alter table public.activities drop constraint activities_elapsed_ms_check;
alter table public.activities add constraint activities_elapsed_ms_check
  check (elapsed_ms is null or elapsed_ms >= 0);
alter table public.activities add constraint activities_manual_observation_check
  check (
    (entry_provenance = 'manual' and manual_activity_category is not null and diary_date is not null and diary_timezone is not null
      and ((started_at is null and finished_at is null) or (started_at is not null and finished_at is not null)))
    or
    (entry_provenance is distinct from 'manual' and manual_activity_category is null and diary_date is null and diary_timezone is null
      and started_at is not null and finished_at is not null and elapsed_ms > 0 and distance_meters is not null)
  );

alter table public.activities
  add constraint activities_reconciled_planned_session_owner_fkey
  foreign key (reconciled_planned_session_id, profile_id)
  references public.planned_sessions(id, profile_id) on delete restrict;

alter table public.activities
  add constraint activities_superseded_by_owner_fkey
  foreign key (superseded_by_activity_id, profile_id)
  references public.activities(id, profile_id) on delete restrict,
  add constraint activities_manual_supersession_check
  check (
    (superseded_by_activity_id is null and superseded_at is null and reconciliation_operation_id is null and reconciled_planned_session_id is null)
    or (entry_provenance = 'manual' and superseded_by_activity_id is not null and superseded_by_activity_id <> id
      and superseded_at is not null and reconciliation_operation_id is not null and reconciled_planned_session_id is not null)
  );
create unique index activities_profile_reconciliation_operation_unique
  on public.activities(profile_id, reconciliation_operation_id)
  where reconciliation_operation_id is not null;

alter table public.planned_sessions add column completion_outcome text, add column skip_operation_id uuid;
update public.planned_sessions
  set completion_outcome = 'full'
  where status = 'completed' and completion_state in ('linked', 'activity_deleted');
alter table public.planned_sessions drop constraint planned_sessions_lifecycle_check;
alter table public.planned_sessions add constraint planned_sessions_lifecycle_check
  check (
    (status = 'scheduled' and num_nonnulls(cancellation_reason, cancelled_at, completed_activity_id, completion_state, completion_outcome, skip_operation_id, linked_at, completion_unlinked_at) = 0)
    or
    (status = 'cancelled' and cancellation_reason is not null and cancelled_at is not null and num_nonnulls(completed_activity_id, completion_state, completion_outcome, skip_operation_id, linked_at, completion_unlinked_at) = 0)
    or
    (status = 'completed' and num_nonnulls(cancellation_reason, cancelled_at) = 0 and (
      (completion_state = 'linked' and completed_activity_id is not null and completion_outcome in ('full', 'partial') and skip_operation_id is null and linked_at is not null and completion_unlinked_at is null)
      or (completion_state = 'activity_deleted' and completed_activity_id is null and completion_outcome in ('full', 'partial') and skip_operation_id is null and linked_at is not null and completion_unlinked_at >= linked_at)
      or (completion_state is null and completion_outcome = 'skipped' and completed_activity_id is null and skip_operation_id is not null and linked_at is not null and completion_unlinked_at is null)
    ))
  );
alter table public.planned_sessions add constraint planned_sessions_completion_outcome_check
  check (completion_outcome is null or completion_outcome in ('full', 'partial', 'skipped'));

create table public.manual_training_diary_operations (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request_fingerprint text not null,
  activity_id uuid not null references public.activities(id) on delete restrict,
  planned_session_id uuid,
  created_at timestamptz not null default now(),
  constraint manual_training_diary_operations_profile_operation_unique unique (profile_id, operation_id)
);
create index manual_training_diary_operations_activity_idx
  on public.manual_training_diary_operations(activity_id);

alter table public.manual_training_diary_operations
  add constraint manual_training_diary_operations_activity_owner_fkey
  foreign key (activity_id, profile_id)
  references public.activities(id, profile_id) on delete restrict,
  add constraint manual_training_diary_operations_planned_session_owner_fkey
  foreign key (planned_session_id, profile_id)
  references public.planned_sessions(id, profile_id) on delete restrict;

alter table public.manual_training_diary_operations enable row level security;
revoke all on table public.manual_training_diary_operations from anon, authenticated;

commit;
