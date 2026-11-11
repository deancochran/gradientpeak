/**
 * Drizzle cannot express PostgreSQL's `ON DELETE SET NULL (column)` extension
 * for composite foreign keys. Keep these ownership constraints as a dedicated
 * source artifact so generated Drizzle SQL cannot replace them with an action
 * that also clears the required profile_id column.
 */
export const activitySourceReferenceImportRunOwnershipSql = `
alter table "public"."activity_source_references"
  add constraint "activity_source_refs_last_import_run_profile_fk" foreign key (last_import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null (last_import_run_id);

alter table "public"."activity_source_references"
  add constraint "activity_source_refs_material_import_run_profile_fk" foreign key (last_material_import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null (last_material_import_run_id);

alter table "public"."provider_sync_jobs"
  add constraint "provider_sync_jobs_import_run_profile_fkey" foreign key (import_run_id, profile_id)
    references public.activity_import_runs(id, profile_id) on delete set null (import_run_id);

create or replace function public.clear_material_import_run_reference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.activity_source_references
  set last_material_import_run_id = null,
      last_material_effective_at = null
  where last_material_import_run_id = old.id
    and profile_id = old.profile_id;
  return old;
end;
$$;

create trigger activity_import_runs_clear_material_source_references
before delete on public.activity_import_runs
for each row execute function public.clear_material_import_run_reference();
`;

export const activitySourceReferenceImportRunOwnershipFunctionNames = [
  "clear_material_import_run_reference",
] as const;

export const activitySourceReferenceImportRunOwnershipTriggerNames = [
  "activity_import_runs_clear_material_source_references",
] as const;
