-- RLS policies for activities table
alter table "activities" enable row level security;

-- Service role can do everything (for edge functions)
create policy "Service role can manage activities" 
on "activities" 
for all 
using (current_setting('role'::text) = 'service_role'::text);

-- Users can read/write their own activities
create policy "Users can view own activities" 
on "activities" 
for select 
using (auth.uid() = profile_id);

create policy "Users can insert own activities" 
on "activities" 
for insert 
with check (auth.uid() = profile_id);

create policy "Users can update own activities" 
on "activities" 
for update 
using (auth.uid() = profile_id);

create policy "Users can delete own activities" 
on "activities" 
for delete 
using (auth.uid() = profile_id);

-- Transactional activity update function for edge functions
create or replace function "update_activity_with_fit"(
  p_activity_id uuid,
  p_profile_id uuid,
  p_cloud_storage_path text,
  p_updated_at timestamptz
) returns json
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Helper function to check activity sync status
create or replace function "get_activity_sync_status"(p_activity_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Performance indexes
create index if not exists "activities_profile_sync_status_idx" 
on "activities" (profile_id, sync_status);

create index if not exists "activities_updated_at_idx" 
on "activities" (updated_at desc);

-- Trigger to automatically update the updated_at timestamp
create or replace function "update_activities_updated_at"()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger "activities_updated_at_trigger"
  before update on "activities"
  for each row
  execute function "update_activities_updated_at"();