begin;

alter table public.activity_plans drop column validation_policy;

alter table public.events drop column training_plan_id cascade;
alter table public.events drop column planned_session_id cascade;
alter table public.events drop column activity_plan_id cascade;

-- Planned events were executable mirrors of planned_sessions. The hard cut removes
-- those redundant rows before narrowing the enum; custom/race events are retained.
delete from public.events where event_type = 'planned';

alter type public.event_type rename to event_type_with_planned;
create type public.event_type as enum ('race_target', 'custom');
alter table public.events
  alter column event_type type public.event_type
  using event_type::text::public.event_type;
drop type public.event_type_with_planned;

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

create trigger planned_sessions_prescription_immutable
before update on public.planned_sessions
for each row execute function public.prevent_planned_session_prescription_mutation();

commit;
