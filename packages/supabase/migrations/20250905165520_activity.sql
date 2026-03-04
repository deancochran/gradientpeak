alter table "public"."activities" enable row level security;

CREATE INDEX activities_profile_sync_status_idx ON public.activities USING btree (profile_id, sync_status);

CREATE INDEX activities_updated_at_idx ON public.activities USING btree (updated_at DESC);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_activity_sync_status(p_activity_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result json;
begin
  select json_build_object(
    'id', id,
    'profile_id', profile_id,
    'sync_status', sync_status,
    'cloud_storage_path', cloud_storage_path,
    'sync_error_message', sync_error_message,
    'updated_at', updated_at
  )
  into v_result
  from "activities"
  where id = p_activity_id
  and (
    profile_id = auth.uid() -- User can check their own
    or current_setting('role'::text) = 'service_role'::text -- Service role can check any
  );
  
  if v_result is null then
    raise exception 'Activity not found or access denied: %', p_activity_id;
  end if;
  
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_activities_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_activity_with_fit(p_activity_id uuid, p_profile_id uuid, p_cloud_storage_path text, p_updated_at timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_affected_rows int;
  v_result json;
begin
  -- Validate inputs
  if p_activity_id is null or p_profile_id is null or p_cloud_storage_path is null then
    raise exception 'Missing required parameters: activity_id, profile_id, or cloud_storage_path';
  end if;

  -- Perform atomic update with verification
  update "activities" 
  set 
    cloud_storage_path = p_cloud_storage_path,
    sync_status = 'synced'::sync_status,
    sync_error_message = null, -- Clear any previous error
    updated_at = p_updated_at
  where 
    id = p_activity_id 
    and profile_id = p_profile_id
    and sync_status in ('local_only', 'syncing', 'sync_failed'); -- Only update unsynced activities

  -- Check if any rows were affected
  get diagnostics v_affected_rows = row_count;
  
  if v_affected_rows = 0 then
    -- Check if activity exists at all
    if not exists (
      select 1 from "activities" 
      where id = p_activity_id and profile_id = p_profile_id
    ) then
      raise exception 'Activity not found or access denied: % for profile %', p_activity_id, p_profile_id;
    else
      -- Activity exists but couldn't be updated (likely already synced)
      raise exception 'Activity % is already synced or in invalid state for update', p_activity_id;
    end if;
  end if;

  -- Return success result
  v_result := json_build_object(
    'success', true,
    'activity_id', p_activity_id,
    'cloud_storage_path', p_cloud_storage_path,
    'updated_at', p_updated_at,
    'affected_rows', v_affected_rows
  );

  return v_result;
  
exception
  when others then
    -- Log the error and re-raise
    raise notice 'update_activity_with_fit error for activity %: %', p_activity_id, sqlerrm;
    raise;
end;
$function$
;

create policy "Service role can manage activities"
on "public"."activities"
as permissive
for all
to public
using ((current_setting('role'::text) = 'service_role'::text));


create policy "Users can delete own activities"
on "public"."activities"
as permissive
for delete
to public
using ((auth.uid() = profile_id));


create policy "Users can insert own activities"
on "public"."activities"
as permissive
for insert
to public
with check ((auth.uid() = profile_id));


create policy "Users can update own activities"
on "public"."activities"
as permissive
for update
to public
using ((auth.uid() = profile_id));


create policy "Users can view own activities"
on "public"."activities"
as permissive
for select
to public
using ((auth.uid() = profile_id));


CREATE TRIGGER activities_updated_at_trigger BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION update_activities_updated_at();


