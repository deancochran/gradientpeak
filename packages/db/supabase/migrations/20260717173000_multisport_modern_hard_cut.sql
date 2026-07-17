begin;

create extension if not exists btree_gist with schema extensions;

-- Populated by the bound cutover tooling. Empty tables keep fresh targets valid.
create table if not exists public._multisport_cutover_runs (
  run_id uuid primary key, manifest_checksum text not null, target_database text not null,
  database_oid oid not null, system_identifier text not null, snapshot_hash text not null,
  backup_hash text not null, storage_archive_hash text not null, storage_inventory_hash text not null,
  preflight_hash text, staging_hash text, status text not null, generated_at timestamptz not null,
  expires_at timestamptz not null
);
create table if not exists public._multisport_activity_plan_manifest (
  run_id uuid not null, id uuid not null, profile_id uuid, name text not null, description text,
  notes text, structure jsonb not null, structure_hash text not null,
  gps_recording_enabled boolean not null, template_visibility text not null,
  content_visibility text not null, import_provider text, import_external_id text,
  is_system_template boolean not null, created_at timestamptz not null, updated_at timestamptz not null,
  before_semantic_hash text, after_semantic_hash text not null, source_semantic_hash text,
  is_new_source boolean not null, primary key(run_id,id)
);
create table if not exists public._multisport_training_plan_manifest (
  run_id uuid not null, id uuid not null, structure jsonb not null, structure_hash text not null,
  primary key(run_id,id)
);
create table if not exists public._multisport_artifact_manifest (
  run_id uuid not null, artifact_id uuid not null, activity_id uuid not null, profile_id uuid not null,
  source_bucket text not null, source_path text not null, storage_object_id uuid not null,
  accepted_bucket text not null, accepted_path text not null, accepted_storage_object_id uuid not null,
  accepted_storage_version text not null,digest text not null, byte_size bigint not null,
  media_type text not null, format text not null, original_name text, ordinal integer not null,
  is_current boolean not null, primary key(run_id,activity_id,ordinal),
  unique(run_id,activity_id,artifact_id)
);
create table if not exists public._multisport_ingestion_manifest (
  run_id uuid not null, ingestion_id uuid not null, activity_id uuid not null, artifact_id uuid,
  operation_key text not null, primary key(run_id,ingestion_id)
);
create table if not exists public._multisport_segment_manifest(
  run_id uuid not null,activity_id uuid not null,segment_id uuid not null,summary jsonb not null,
  summary_hash text not null,primary key(run_id,activity_id)
);

do $$
declare
  missing_ids text;
  active_run_id uuid;
begin
  if exists(select 1 from public.activities) or exists(select 1 from public.activity_plans)
    or exists(select 1 from public.training_plans) then
    select run_id into active_run_id from public._multisport_cutover_runs
    where status='migrating' and expires_at>now();
    if active_run_id is null then
      raise exception 'multisport hard cut blocked: no verified migrating cutover run';
    end if;
    if (select count(*) from public._multisport_cutover_runs where status='migrating' and expires_at>now()) <> 1 then
      raise exception 'multisport hard cut blocked: ambiguous cutover run identity';
    end if;
    if exists(
      select 1 from public._multisport_cutover_runs r,pg_control_system() control
      where r.run_id=active_run_id and (r.target_database<>current_database()
        or r.database_oid<>(select oid from pg_database where datname=current_database())
        or r.system_identifier<>control.system_identifier::text or r.staging_hash is null
        or r.manifest_checksum !~ '^[0-9a-f]{64}$')
    ) then raise exception 'multisport hard cut blocked: target/staging identity mismatch'; end if;
    perform set_config('gradientpeak.cutover_writer_bypass','on',true);
    perform set_config('gradientpeak.cutover_run_id',active_run_id::text,true);
    if exists(select 1 from public._multisport_activity_plan_manifest where run_id<>active_run_id)
      or exists(select 1 from public._multisport_training_plan_manifest where run_id<>active_run_id)
      or exists(select 1 from public._multisport_artifact_manifest where run_id<>active_run_id)
      or exists(select 1 from public._multisport_ingestion_manifest where run_id<>active_run_id)
      or exists(select 1 from public._multisport_segment_manifest where run_id<>active_run_id) then
      raise exception 'multisport hard cut blocked: stale/cross-snapshot staging rows';
    end if;
  end if;
  select string_agg(p.id::text, ', ' order by p.id)
    into missing_ids
  from public.activity_plans p
  left join public._multisport_activity_plan_manifest m on m.id=p.id and m.run_id=active_run_id
  where m.id is null;
  if missing_ids is not null then
    raise exception 'multisport hard cut blocked: activity plans missing staged conversion: %', missing_ids;
  end if;

  select string_agg(a.id::text,', ' order by a.id) into missing_ids
  from public.activities a left join public._multisport_segment_manifest s
    on s.activity_id=a.id and s.run_id=active_run_id where s.activity_id is null;
  if missing_ids is not null then raise exception 'multisport hard cut blocked: activities missing Core-validated staged segment: %',missing_ids; end if;

  select string_agg(p.id::text, ', ' order by p.id)
    into missing_ids
  from public.training_plans p
  left join public._multisport_training_plan_manifest m on m.id=p.id and m.run_id=active_run_id
  where m.id is null;
  if missing_ids is not null then
    raise exception 'multisport hard cut blocked: training plans missing staged canonical conversion: %', missing_ids;
  end if;

  select string_agg(a.id::text, ', ' order by a.id)
    into missing_ids
  from public.activities a
  left join public._multisport_artifact_manifest m on m.activity_id = a.id and m.run_id=active_run_id and m.is_current
  where a.activity_file_path is not null and m.activity_id is null;
  if missing_ids is not null then
    raise exception 'multisport hard cut blocked: activities missing verified artifact: %', missing_ids;
  end if;

  if exists (
    select 1 from public.activities
    where type not in ('run', 'bike', 'swim', 'strength', 'other')
  ) then
    raise exception 'multisport hard cut blocked: unsupported historical activity type';
  end if;

  if exists (
    select 1
    from public.activity_efforts e
    join public.activities a on a.id = e.activity_id
    where e.start_offset is null
       or e.activity_category::text <> a.type
       or e.start_offset < 0
       or (e.start_offset + e.duration_seconds) * 1000 >
          greatest(round(extract(epoch from (a.finished_at - a.started_at)) * 1000),a.duration_seconds*1000)
  ) then
    raise exception 'multisport hard cut blocked: effort cannot map unambiguously to historical segment';
  end if;
end $$;

-- The backup rehearsal may predate the immediately preceding visibility cut;
-- converge it here so the hard cut remains forward deployable from either
-- accepted local predecessor.
alter table public.profiles add column if not exists default_content_visibility text;
update public.profiles set default_content_visibility='private' where default_content_visibility is null;
alter table public.profiles alter column default_content_visibility set default 'private', alter column default_content_visibility set not null;
alter table public.profiles drop constraint if exists profiles_default_content_visibility_check;
alter table public.profiles add constraint profiles_default_content_visibility_check check (default_content_visibility in ('private','followers','public'));

alter table public.activity_plans add column if not exists content_visibility text;
update public.activity_plans set content_visibility=case when is_system_template then 'public' when template_visibility='public' then 'followers' else 'private' end where content_visibility is null;
alter table public.activity_plans alter column content_visibility set default 'private', alter column content_visibility set not null;
alter table public.training_plans add column if not exists content_visibility text;
update public.training_plans set content_visibility=case when is_system_template then 'public' when template_visibility='public' then 'followers' else 'private' end where content_visibility is null;
alter table public.training_plans alter column content_visibility set default 'private', alter column content_visibility set not null;
alter table public.activities add column if not exists content_visibility text;
update public.activities set content_visibility=case when is_private then 'private' else 'followers' end where content_visibility is null;
alter table public.activities alter column content_visibility set default 'private', alter column content_visibility set not null;
create index if not exists idx_activity_plans_content_visibility on public.activity_plans(content_visibility);
create index if not exists idx_training_plans_content_visibility on public.training_plans(content_visibility);
create index if not exists idx_activities_content_visibility on public.activities(content_visibility);

create table public.canonical_activity_categories (
  code text primary key,
  display_name text not null,
  enabled boolean not null default true
);
insert into public.canonical_activity_categories(code, display_name, enabled) values
  ('run', 'Run', true),
  ('bike', 'Bike', true),
  ('swim', 'Swim', true),
  ('strength', 'Strength', true),
  ('other', 'Other', true);

alter table public.activity_plans
  add column structure_hash text,
  add column gps_recording_enabled boolean not null default true;

update public.activity_plans p
set name = m.name,
    description = m.description,
    notes = m.notes,
    structure = m.structure,
    structure_hash = m.structure_hash,
    gps_recording_enabled = m.gps_recording_enabled,
    template_visibility = m.template_visibility,
    content_visibility = m.content_visibility,
    import_provider = m.import_provider,
    import_external_id = m.import_external_id,
    is_system_template = m.is_system_template,
    updated_at = m.updated_at
from public._multisport_activity_plan_manifest m
where p.id = m.id and m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating');

alter table public.activity_plans
  alter column structure_hash set not null,
  drop column activity_category,
  drop column version,
  add constraint activity_plans_structure_v3_check check (
    jsonb_typeof(structure) = 'object'
    and structure->>'version' = '3'
    and jsonb_typeof(structure->'segments') = 'array'
    and jsonb_array_length(structure->'segments') between 1 and 64
    and pg_column_size(structure) <= 1048576
  ),
  add constraint activity_plans_structure_hash_check
    check (structure_hash ~ '^v1:sha256:[0-9a-f]{64}$');

insert into public.activity_plans (
  id, created_at, updated_at, profile_id, name, description, notes, structure,
  template_visibility, content_visibility, import_provider, import_external_id,
  is_system_template, structure_hash, gps_recording_enabled
)
select m.id, m.created_at, m.updated_at, m.profile_id, m.name, m.description, m.notes,
       m.structure, m.template_visibility, m.content_visibility, m.import_provider,
       m.import_external_id, m.is_system_template, m.structure_hash,
       m.gps_recording_enabled
from public._multisport_activity_plan_manifest m
where m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating')
  and not exists (select 1 from public.activity_plans p where p.id = m.id);

alter table public.training_plans add column structure_hash text;
update public.training_plans p
set structure = m.structure, structure_hash = m.structure_hash
from public._multisport_training_plan_manifest m
where p.id = m.id and m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating');
alter table public.training_plans
  alter column structure_hash set not null,
  add constraint training_plans_structure_v1_check check (
    jsonb_typeof(structure) = 'object'
    and structure->>'version' = '1'
    and jsonb_typeof(structure->'sessions') = 'array'
    and jsonb_array_length(structure->'sessions') > 0
    and pg_column_size(structure) <= 1048576
  ),
  add constraint training_plans_structure_hash_check
    check (structure_hash ~ '^v1:sha256:[0-9a-f]{64}$');

do $$
declare missing_reference text;
begin
  select string_agg(distinct session->>'activity_plan_id', ', ' order by session->>'activity_plan_id')
  into missing_reference
  from public.training_plans p
  cross join lateral jsonb_array_elements(p.structure->'sessions') session
  left join public.activity_plans ap on ap.id = (session->>'activity_plan_id')::uuid
  where ap.id is null;
  if missing_reference is not null then
    raise exception 'multisport hard cut blocked: unresolved training-plan activity plan references: %', missing_reference;
  end if;
end $$;

alter table public.activities
  add column elapsed_ms bigint,
  add column active_ms bigint,
  add column moving_ms bigint,
  add column timing_coverage text,
  add column segments_revision integer,
  add column parser_version text,
  add column decoded_contract_version text,
  add column materializer_version text,
  add column segments_generated_at timestamptz;

update public.activities
set elapsed_ms = greatest(
      round(extract(epoch from (finished_at - started_at)) * 1000),
      duration_seconds::bigint * 1000,
      moving_seconds::bigint * 1000
    ),
    active_ms = null,
    moving_ms = null,
    timing_coverage = 'partial',
    segments_revision = 1,
    parser_version = 'historical-v1',
    decoded_contract_version = 'historical-v1',
    materializer_version = 'historical-v1',
    segments_generated_at = updated_at;

alter table public.activities
  drop constraint activities_moving_time_check,
  alter column elapsed_ms set not null,
  alter column timing_coverage set not null,
  alter column timing_coverage set default 'unavailable',
  alter column segments_revision set not null,
  alter column segments_revision set default 1,
  alter column parser_version set not null,
  alter column decoded_contract_version set not null,
  alter column materializer_version set not null,
  alter column segments_generated_at set not null,
  alter column segments_generated_at set default now(),
  add constraint activities_elapsed_ms_check check (elapsed_ms > 0),
  add constraint activities_active_ms_check check (active_ms is null or (active_ms >= 0 and active_ms <= elapsed_ms)),
  add constraint activities_moving_ms_check check (moving_ms is null or (moving_ms >= 0 and moving_ms <= coalesce(active_ms, elapsed_ms))),
  add constraint activities_moving_time_check check (moving_ms is null or active_ms is null or moving_ms <= active_ms),
  add constraint activities_segments_revision_check check (segments_revision > 0),
  add constraint activities_timing_coverage_values_check check (
    (timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    or (timing_coverage in ('partial','unavailable') and active_ms is null and moving_ms is null)
  );

create function public.activity_artifact_content_path(target_profile_id uuid,target_digest text) returns text
language sql immutable strict set search_path='' as $$
  select 'artifacts/sha256/'||target_profile_id::text||'/'||target_digest
$$;

create table public.activity_artifacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  digest_algorithm text not null default 'sha256',
  digest text not null,
  byte_size bigint not null,
  bucket text not null,
  path text not null,
  media_type text not null,
  format text not null,
  original_name text,
  availability text not null default 'accepted',
  first_accepted_at timestamptz not null default now(),
  retention_until timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  constraint activity_artifacts_id_profile_unique unique(id, profile_id),
  constraint activity_artifacts_profile_digest_size_unique unique(profile_id, digest_algorithm, digest, byte_size),
  constraint activity_artifacts_bucket_path_unique unique(bucket, path),
  constraint activity_artifacts_sha256_check check (digest_algorithm = 'sha256' and digest ~ '^[0-9a-f]{64}$'),
  constraint activity_artifacts_byte_size_check check (byte_size > 0),
  constraint activity_artifacts_path_check check (btrim(bucket) <> '' and btrim(path) <> ''),
  constraint activity_artifacts_content_addressed_path_check check (path=public.activity_artifact_content_path(profile_id,digest)),
  constraint activity_artifacts_availability_check check (availability in ('accepted', 'deletion_pending', 'deleted')),
  constraint activity_artifacts_lifecycle_check check (
    (availability='accepted' and deletion_requested_at is null and deleted_at is null)
    or (availability='deletion_pending' and deletion_requested_at is not null and deleted_at is null)
    or (availability='deleted' and deletion_requested_at is not null and deleted_at is not null)
  )
);
create index idx_activity_artifacts_profile on public.activity_artifacts(profile_id);

do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='version') then
    insert into storage.objects(id,bucket_id,name,metadata,version)
    select distinct on(accepted_storage_object_id) accepted_storage_object_id,accepted_bucket,accepted_path,
      jsonb_build_object('size',byte_size,'mimetype',media_type,'cacheControl','max-age=31536000, immutable',
        'contentLength',byte_size,'httpStatusCode',200),
      accepted_storage_version
    from public._multisport_artifact_manifest
    where run_id=(select run_id from public._multisport_cutover_runs where status='migrating')
    order by accepted_storage_object_id,accepted_path;
  else
    insert into storage.objects(id,bucket_id,name)
    select distinct on(accepted_storage_object_id) accepted_storage_object_id,accepted_bucket,accepted_path
    from public._multisport_artifact_manifest
    where run_id=(select run_id from public._multisport_cutover_runs where status='migrating')
    order by accepted_storage_object_id,accepted_path;
  end if;
end $$;

create function public.enforce_activity_artifact_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.profile_id, new.digest_algorithm, new.digest, new.byte_size, new.bucket, new.path,
         new.media_type, new.format, new.original_name, new.first_accepted_at)
     is distinct from
     row(old.profile_id, old.digest_algorithm, old.digest, old.byte_size, old.bucket, old.path,
         old.media_type, old.format, old.original_name, old.first_accepted_at) then
    raise exception 'accepted activity artifact byte identity is immutable';
  end if;
  if new.availability is distinct from old.availability then
    if current_setting('gradientpeak.artifact_lifecycle_authorized',true) is distinct from 'on' then
      raise exception 'activity artifact lifecycle requires authorized service workflow';
    end if;
    if not ((old.availability='accepted' and new.availability='deletion_pending')
      or (old.availability='deletion_pending' and new.availability='deleted')) then
      raise exception 'invalid activity artifact lifecycle transition';
    end if;
  end if;
  return new;
end $$;
create trigger activity_artifacts_immutable_before_update
before update on public.activity_artifacts
for each row execute function public.enforce_activity_artifact_immutable();

create function public.block_activity_artifact_direct_delete() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.availability<>'deleted'
    or current_setting('gradientpeak.artifact_hard_delete_authorized',true) is distinct from 'on' then
    raise exception 'activity artifact delete requires completed service lifecycle';
  end if;
  return old;
end $$;
create trigger activity_artifacts_block_direct_delete
before delete on public.activity_artifacts for each row
execute function public.block_activity_artifact_direct_delete();

create function public.request_activity_artifact_deletion(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.activity_artifacts where id=target_id and availability='accepted' for update;
  if not found then raise exception 'artifact is not accepted or does not exist'; end if;
  update public.activity_segments set source_artifact_id=null,source_session_index=null,source_message_index=null
    where source_artifact_id=target_id;
  update public.activity_file_ingestions set artifact_id=null,status='failed',claim_token=null,lease_expires_at=null,
    failed_at=coalesce(failed_at,now()),last_error_code='artifact_deletion_requested',
    last_error_message='Accepted source artifact entered controlled deletion',updated_at=now()
    where artifact_id=target_id;
  delete from public.activity_artifact_links where artifact_id=target_id;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deletion_pending',deletion_requested_at=now()
  where id=target_id and availability='accepted';
end $$;
create function public.finalize_activity_artifact_deletion(target_id uuid, storage_deleted boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not storage_deleted then raise exception 'storage deletion proof is required'; end if;
  perform set_config('gradientpeak.artifact_lifecycle_authorized','on',true);
  update public.activity_artifacts set availability='deleted',deleted_at=now()
  where id=target_id and availability='deletion_pending';
  if not found then raise exception 'artifact is not deletion_pending or does not exist'; end if;
end $$;
create function public.purge_deleted_activity_artifact(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform set_config('gradientpeak.artifact_hard_delete_authorized','on',true);
  delete from public.activity_artifacts where id=target_id and availability='deleted';
  if not found then raise exception 'artifact tombstone is not deletable'; end if;
end $$;

insert into public.activity_artifacts(
  id, profile_id, digest, byte_size, bucket, path, media_type, format,
  original_name, first_accepted_at
)
select distinct on (artifact_id) artifact_id, profile_id, digest, byte_size, accepted_bucket, accepted_path, media_type, format,
       original_name, now()
from public._multisport_artifact_manifest
where run_id=(select run_id from public._multisport_cutover_runs where status='migrating')
order by artifact_id, accepted_path;

create table public.activity_artifact_links (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  artifact_id uuid not null,
  profile_id uuid not null,
  role text not null,
  ordinal integer not null,
  is_current boolean not null default false,
  provider_revision text,
  linked_at timestamptz not null default now(),
  constraint activity_artifact_links_activity_profile_fkey
    foreign key(activity_id, profile_id) references public.activities(id, profile_id) on delete cascade,
  constraint activity_artifact_links_artifact_profile_fkey
    foreign key(artifact_id, profile_id) references public.activity_artifacts(id, profile_id) on delete restrict,
  constraint activity_artifact_links_activity_artifact_profile_unique unique(activity_id, artifact_id, profile_id),
  constraint activity_artifact_links_activity_artifact_role_unique unique(activity_id, artifact_id, role),
  constraint activity_artifact_links_activity_role_ordinal_unique unique(activity_id, role, ordinal),
  constraint activity_artifact_links_ordinal_check check (ordinal >= 0),
  constraint activity_artifact_links_current_source_check check (not is_current or role = 'source'),
  constraint activity_artifact_links_role_check check (role in ('source', 'supplemental', 'export'))
);
create unique index activity_artifact_links_current_source_unique
  on public.activity_artifact_links(activity_id) where role = 'source' and is_current;
create index idx_activity_artifact_links_artifact on public.activity_artifact_links(artifact_id);

insert into public.activity_artifact_links(
  activity_id, artifact_id, profile_id, role, ordinal, is_current, provider_revision
)
select m.activity_id, m.artifact_id, m.profile_id, 'source', m.ordinal, m.is_current, a.external_id
from public._multisport_artifact_manifest m
join public.activities a on a.id = m.activity_id
where m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating');

create function public.switch_activity_source_artifact(
  target_activity_id uuid,target_artifact_id uuid,target_profile_id uuid,target_provider_revision text default null
) returns public.activity_artifact_links
language plpgsql security definer set search_path='' as $$
declare inserted public.activity_artifact_links;
begin
  perform 1 from public.activities where id=target_activity_id and profile_id=target_profile_id for update;
  if not found then raise exception 'activity/profile not found'; end if;
  update public.activity_artifact_links set is_current=false
    where activity_id=target_activity_id and role='source' and is_current;
  insert into public.activity_artifact_links(activity_id,artifact_id,profile_id,role,ordinal,is_current,provider_revision)
  values(target_activity_id,target_artifact_id,target_profile_id,'source',
    coalesce((select max(ordinal)+1 from public.activity_artifact_links where activity_id=target_activity_id and role='source'),0),
    true,target_provider_revision) returning * into inserted;
  return inserted;
end $$;

create table public.activity_segments (
  id uuid primary key,
  activity_id uuid not null,
  profile_id uuid not null,
  ordinal integer not null,
  role text not null,
  category text references public.canonical_activity_categories(code) on delete restrict,
  start_offset_ms bigint not null,
  end_offset_ms bigint not null,
  source_artifact_id uuid,
  source_session_index integer,
  source_message_index integer,
  raw_type_string text,
  raw_type_integer integer,
  raw_sport_string text,
  raw_sport_integer integer,
  summary jsonb not null,
  summary_version integer not null default 1,
  timing_coverage text not null,
  active_ms bigint,
  moving_ms bigint,
  segment_revision integer not null default 1,
  parser_version text not null,
  materializer_version text not null,
  created_at timestamptz not null default now(),
  constraint activity_segments_activity_profile_fkey
    foreign key(activity_id, profile_id) references public.activities(id, profile_id) on delete cascade,
  constraint activity_segments_source_link_fkey
    foreign key(activity_id, source_artifact_id, profile_id)
    references public.activity_artifact_links(activity_id, artifact_id, profile_id) on delete restrict,
  constraint activity_segments_id_activity_profile_unique unique(id, activity_id, profile_id),
  constraint activity_segments_effort_category_unique unique(id,activity_id,profile_id,category),
  constraint activity_segments_activity_ordinal_unique unique(activity_id, ordinal),
  constraint activity_segments_ordinal_check check (ordinal >= 0),
  constraint activity_segments_offset_check check (start_offset_ms >= 0 and end_offset_ms > start_offset_ms),
  constraint activity_segments_role_check check (role in ('activity', 'transition', 'rest', 'unknown')),
  constraint activity_segments_role_category_check check ((role = 'activity' and category is not null) or (role <> 'activity' and category is null)),
  constraint activity_segments_unknown_source_check check (role <> 'unknown' or num_nonnulls(raw_type_string, raw_type_integer, raw_sport_string, raw_sport_integer) > 0),
  constraint activity_segments_source_indexes_check check ((source_session_index is null and source_message_index is null) or source_artifact_id is not null),
  constraint activity_segments_summary_check check (summary_version = 1 and jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 1048576),
  constraint activity_segments_timing_check check (active_ms is null or (active_ms >= 0 and active_ms <= end_offset_ms - start_offset_ms)),
  constraint activity_segments_moving_check check (moving_ms is null or (moving_ms >= 0 and moving_ms <= coalesce(active_ms, end_offset_ms - start_offset_ms))),
  constraint activity_segments_timing_coverage_check check (timing_coverage in ('complete', 'partial', 'unavailable')),
  constraint activity_segments_timing_coverage_values_check check (
    (timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    or (timing_coverage='partial' and num_nonnulls(active_ms,moving_ms)>0)
    or (timing_coverage='unavailable' and active_ms is null and moving_ms is null)
  ),
  constraint activity_segments_revision_check check (segment_revision > 0),
  exclude using gist (activity_id with =, int8range(start_offset_ms, end_offset_ms, '[)') with &&)
    deferrable initially deferred
);
create index idx_activity_segments_activity on public.activity_segments(activity_id, ordinal);
create index idx_activity_segments_category on public.activity_segments(category) where category is not null;

insert into public.activity_segments(
  id, activity_id, profile_id, ordinal, role, category, start_offset_ms, end_offset_ms,
  source_artifact_id, raw_type_string, summary, summary_version, timing_coverage,
  active_ms, moving_ms, segment_revision, parser_version, materializer_version, created_at
)
select sm.segment_id,
       a.id, a.profile_id, 0, 'activity', a.type, 0, a.elapsed_ms, m.artifact_id,
       a.type,
       sm.summary,
       1, 'partial', a.duration_seconds::bigint*1000, a.moving_seconds::bigint*1000, 1, 'historical-v1', 'historical-v1', a.updated_at
from public.activities a
join public._multisport_segment_manifest sm on sm.activity_id=a.id
  and sm.run_id=(select run_id from public._multisport_cutover_runs where status='migrating')
left join public._multisport_artifact_manifest m on m.activity_id = a.id and m.is_current
  and m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating');

create function public.validate_activity_segment_set(target_activity_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  parent_record record;
  segment_count integer;
  max_ordinal integer;
  summed_active bigint;
  summed_moving bigint;
  complete_count integer;
begin
  select elapsed_ms, active_ms, moving_ms,timing_coverage into parent_record
  from public.activities where id = target_activity_id;
  if not found then return; end if;

  select count(*), max(ordinal), sum(active_ms), sum(moving_ms),
    count(*) filter(where timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    into segment_count, max_ordinal, summed_active, summed_moving,complete_count
  from public.activity_segments where activity_id = target_activity_id;
  if segment_count = 0 or max_ordinal <> segment_count - 1 then
    raise exception 'activity % segment ordinals must be contiguous from zero', target_activity_id;
  end if;
  if exists (select 1 from public.activity_segments where activity_id = target_activity_id and end_offset_ms > parent_record.elapsed_ms) then
    raise exception 'activity % segment exceeds parent elapsed bounds', target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    left join public.activity_segments p on p.activity_id=s.activity_id and p.ordinal=s.ordinal-1
    left join public.activity_segments n on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='transition'
      and (p.role is distinct from 'activity' or n.role is distinct from 'activity')
  ) then raise exception 'activity % transition must be between activity segments', target_activity_id; end if;
  if exists (
    select 1 from public.activity_segments s join public.activity_segments n
      on n.activity_id=s.activity_id and n.ordinal=s.ordinal+1
    where s.activity_id=target_activity_id and s.role='rest' and n.role='rest'
  ) then raise exception 'activity % has consecutive rest segments', target_activity_id; end if;
  if parent_record.timing_coverage='complete' then
    if complete_count<>segment_count then
      raise exception 'activity % complete parent requires complete timing for every segment',target_activity_id;
    end if;
    if parent_record.active_ms is distinct from summed_active or parent_record.moving_ms is distinct from summed_moving then
      raise exception 'activity % complete timing does not reconcile with segments',target_activity_id;
    end if;
  elsif parent_record.active_ms is not null or parent_record.moving_ms is not null then
    raise exception 'activity % partial/unavailable parent timing totals must be null',target_activity_id;
  end if;
  if exists (
    select 1 from public.activity_segments s
    where s.activity_id=target_activity_id
       and (s.summary->>'version' is distinct from s.summary_version::text
         or s.summary#>>'{timing,timingCoverage}' is distinct from s.timing_coverage
         or (s.summary#>>'{timing,activeMs}')::bigint is distinct from s.active_ms
         or (s.summary#>>'{timing,movingMs}')::bigint is distinct from s.moving_ms)
  ) then raise exception 'activity % segment summary timing/version mismatch', target_activity_id; end if;
end $$;

create function public.activity_segment_set_constraint_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.validate_activity_segment_set(coalesce(new.activity_id, old.activity_id));
  return null;
end $$;
create constraint trigger activity_segments_validate_set
after insert or update or delete on public.activity_segments
deferrable initially deferred for each row
execute function public.activity_segment_set_constraint_trigger();

create function public.activity_parent_segment_set_constraint_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.validate_activity_segment_set(new.id);
  return null;
end $$;
create constraint trigger activities_validate_segment_set
after insert or update on public.activities
deferrable initially deferred for each row
execute function public.activity_parent_segment_set_constraint_trigger();

alter table public.activity_efforts
  add column segment_id uuid,
  add column category_code text;
update public.activity_efforts
set category_code = activity_category::text;
do $$ begin
  if exists(
    select 1 from public.activity_efforts e where e.activity_id is not null and
      (select count(*) from public.activity_segments s where s.activity_id=e.activity_id
        and s.profile_id=e.profile_id and s.category=e.activity_category::text
        and e.start_offset*1000>=s.start_offset_ms
        and (e.start_offset+e.duration_seconds)*1000<=s.end_offset_ms)<>1
  ) then raise exception 'multisport hard cut blocked: effort segment mapping is crossing or ambiguous'; end if;
end $$;
update public.activity_efforts e
set segment_id = s.id
from public.activity_segments s
where s.activity_id = e.activity_id
  and e.start_offset * 1000 >= s.start_offset_ms
  and (e.start_offset + e.duration_seconds) * 1000 <= s.end_offset_ms
  and s.category = e.activity_category::text;
do $$ begin
  if exists (select 1 from public.activity_efforts where activity_id is not null and segment_id is null) then
    raise exception 'multisport hard cut blocked: unresolved activity effort segment';
  end if;
end $$;
alter table public.activity_efforts
  drop constraint if exists activity_efforts_supported_combination_check,
  drop constraint if exists activity_efforts_unit_compatibility_check,
  drop constraint if exists activity_efforts_bike_power_max_check,
  drop constraint if exists activity_efforts_run_speed_bounds_check,
  drop constraint if exists activity_efforts_swim_speed_bounds_check,
  drop column activity_category;
alter table public.activity_efforts rename column category_code to activity_category;
alter table public.activity_efforts
  alter column activity_category set not null,
  add constraint activity_efforts_activity_category_fkey foreign key(activity_category)
    references public.canonical_activity_categories(code) on delete restrict,
  add constraint activity_efforts_segment_activity_profile_category_fkey
    foreign key(segment_id, activity_id, profile_id, activity_category)
    references public.activity_segments(id, activity_id, profile_id, category) on delete cascade,
  add constraint activity_efforts_activity_segment_check
    check ((activity_id is null and segment_id is null) or (activity_id is not null and segment_id is not null)),
  add constraint activity_efforts_value_finite_positive_check
    check (coalesce(
      (value > 0 and value not in ('NaN'::real, 'Infinity'::real, '-Infinity'::real))
      or (
        value = 0
        and activity_id is null
        and activity_category = 'bike'
        and effort_type = 'power'
        and source = 'manual'
        and method = 'profile_update_override'
        and provenance ->> 'override_state' = 'cleared'
      ),
      false
    )),
  add constraint activity_efforts_supported_combination_check
    check ((activity_category = 'bike' and effort_type = 'power') or (activity_category in ('run', 'swim') and effort_type = 'speed')),
  add constraint activity_efforts_unit_compatibility_check
    check ((activity_category = 'bike' and effort_type = 'power' and unit in ('watts', 'W')) or (activity_category in ('run', 'swim') and effort_type = 'speed' and unit in ('meters_per_second', 'm/s'))),
  add constraint activity_efforts_bike_power_max_check check (activity_category <> 'bike' or effort_type <> 'power' or value <= 3000),
  add constraint activity_efforts_run_speed_bounds_check check (activity_category <> 'run' or effort_type <> 'speed' or (value >= 0.3 and value <= 13)),
  add constraint activity_efforts_swim_speed_bounds_check check (activity_category <> 'swim' or effort_type <> 'speed' or (value >= 0.1 and value <= 3));
create index idx_activity_efforts_segment_id on public.activity_efforts(segment_id);

create function public.validate_activity_effort_segment_range() returns trigger
language plpgsql set search_path='' as $$
declare segment_record record;
begin
  if new.activity_id is null then return new; end if;
  select start_offset_ms,end_offset_ms,category into segment_record from public.activity_segments
    where id=new.segment_id and activity_id=new.activity_id and profile_id=new.profile_id;
  if not found or segment_record.category<>new.activity_category
    or new.start_offset is null or new.start_offset*1000<segment_record.start_offset_ms
    or (new.start_offset+new.duration_seconds)*1000>segment_record.end_offset_ms then
    raise exception 'activity effort must be contained by its matching-category segment';
  end if;
  return new;
end $$;
create trigger activity_efforts_validate_segment_range
before insert or update on public.activity_efforts for each row
execute function public.validate_activity_effort_segment_range();

alter table public.activity_file_ingestions
  drop constraint activity_file_ingestions_activity_profile_fkey,
  alter column activity_id drop not null,
  add column artifact_id uuid,
  add column integration_id uuid references public.integrations(id) on delete set null,
  add column operation_key text,
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column received_at timestamptz;
update public.activity_file_ingestions i
set artifact_id = m.artifact_id,
    operation_key = m.operation_key,
    received_at = i.requested_at
from public._multisport_ingestion_manifest m
where m.ingestion_id = i.id
  and m.run_id=(select run_id from public._multisport_cutover_runs where status='migrating');
update public.activity_file_ingestions
set operation_key='legacy:'||id::text,received_at=requested_at
where operation_key is null;
alter table public.activity_file_ingestions
  alter column operation_key set not null,
  alter column received_at set not null,
  alter column received_at set default now(),
  add constraint activity_file_ingestions_activity_profile_fkey
    foreign key(activity_id, profile_id) references public.activities(id, profile_id) on delete cascade,
  add constraint activity_file_ingestions_artifact_profile_fkey
    foreign key(artifact_id, profile_id) references public.activity_artifacts(id, profile_id) on delete restrict,
  add constraint activity_file_ingestions_ready_check
    check (status <> 'ready' or (activity_id is not null and artifact_id is not null)),
  add constraint activity_file_ingestions_claim_check
    check ((claim_token is null) = (lease_expires_at is null)),
  add constraint activity_file_ingestions_operation_key_check check (btrim(operation_key) <> ''),
  drop constraint if exists activity_file_ingestions_file_size_check,
  drop column file_path,
  drop column file_size,
  drop column file_type;
create unique index activity_file_ingestions_profile_operation_unique
  on public.activity_file_ingestions(profile_id, operation_key);
create index idx_activity_file_ingestions_artifact_id
  on public.activity_file_ingestions(artifact_id) where artifact_id is not null;

alter table public.activities
  drop constraint activities_duration_seconds_check,
  drop constraint activities_moving_seconds_check,
  drop constraint if exists activities_import_file_type_non_empty_check,
  drop constraint if exists activities_import_original_file_name_non_empty_check,
  drop constraint if exists activities_import_source_check,
  drop column type,
  drop column duration_seconds,
  drop column moving_seconds,
  drop column activity_file_path,
  drop column activity_file_size,
  drop column import_source,
  drop column import_file_type,
  drop column import_original_file_name;
drop index if exists public.idx_activities_type;
drop index if exists public.idx_activities_activity_file_path;

drop type public.activity_category;

alter table public.canonical_activity_categories enable row level security;
alter table public.activity_artifacts enable row level security;
alter table public.activity_artifact_links enable row level security;
alter table public.activity_segments enable row level security;

create table public.multisport_cutover_audits(
  run_id uuid primary key,manifest_checksum text not null,final_manifest_checksum text not null,
  snapshot_hash text not null,staging_hash text not null,backup_hash text not null,
  storage_archive_hash text not null,storage_inventory_hash text not null,status text not null,
  migrated_at timestamptz not null default now(),audited_at timestamptz
);
create table public.multisport_cutover_template_audits(
  run_id uuid not null,activity_plan_id uuid not null,before_semantic_hash text,
  after_semantic_hash text not null,source_semantic_hash text,is_new_source boolean not null,
  primary key(run_id,activity_plan_id),foreign key(run_id) references public.multisport_cutover_audits(run_id) on delete restrict
);
insert into public.multisport_cutover_audits(
  run_id,manifest_checksum,final_manifest_checksum,snapshot_hash,staging_hash,backup_hash,
  storage_archive_hash,storage_inventory_hash,status
)
select run_id,manifest_checksum,manifest_checksum,snapshot_hash,staging_hash,backup_hash,
  storage_archive_hash,storage_inventory_hash,'migrated'
from public._multisport_cutover_runs where status='migrating';
insert into public.multisport_cutover_template_audits
select run_id,id,before_semantic_hash,after_semantic_hash,source_semantic_hash,is_new_source
from public._multisport_activity_plan_manifest
where run_id=(select run_id from public._multisport_cutover_runs where status='migrating');
alter table public.multisport_cutover_audits enable row level security;
alter table public.multisport_cutover_template_audits enable row level security;
revoke all on table public.canonical_activity_categories, public.activity_artifacts,
  public.activity_artifact_links, public.activity_segments,public.multisport_cutover_audits,
  public.multisport_cutover_template_audits from public, anon, authenticated;
grant select, insert, update, delete on table public.canonical_activity_categories,
  public.activity_artifacts, public.activity_artifact_links, public.activity_segments,
  public.multisport_cutover_audits,public.multisport_cutover_template_audits to service_role;
revoke all on function public.request_activity_artifact_deletion(uuid),
  public.finalize_activity_artifact_deletion(uuid,boolean),public.purge_deleted_activity_artifact(uuid),
  public.switch_activity_source_artifact(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_activity_artifact_deletion(uuid),
  public.finalize_activity_artifact_deletion(uuid,boolean),public.purge_deleted_activity_artifact(uuid),
  public.switch_activity_source_artifact(uuid,uuid,uuid,text) to service_role;

drop trigger if exists multisport_writer_fence on public.activities;
drop trigger if exists multisport_writer_fence on public.activity_plans;
drop trigger if exists multisport_writer_fence on public.training_plans;
drop trigger if exists multisport_writer_fence on public.events;
drop trigger if exists multisport_writer_fence on public.group_events;
do $$ begin if to_regclass('public.group_event_activity_plans') is not null then
  execute 'drop trigger if exists multisport_writer_fence on public.group_event_activity_plans';
end if; end $$;
drop trigger if exists multisport_writer_fence on public.activity_efforts;
drop trigger if exists multisport_writer_fence on public.activity_file_ingestions;
drop trigger if exists multisport_writer_fence on public.provider_sync_jobs;
drop trigger if exists multisport_writer_fence on public.integration_resource_links;
drop trigger if exists multisport_writer_fence on storage.objects;
drop function if exists public.enforce_multisport_writer_fence();
drop function if exists public.enforce_multisport_storage_writer_fence();
drop table if exists public._multisport_writer_fence;

drop table public._multisport_ingestion_manifest;
drop table public._multisport_segment_manifest;
drop table public._multisport_artifact_manifest;
drop table public._multisport_training_plan_manifest;
drop table public._multisport_activity_plan_manifest;
drop table public._multisport_cutover_runs;

commit;
