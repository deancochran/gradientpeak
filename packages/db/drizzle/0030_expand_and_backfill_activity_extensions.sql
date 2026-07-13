-- ONE-TIME PRE-AUTHORITY BACKFILL. Do not rerun after parent authority starts.
-- Child non-null values are authoritative only during this initial backfill.
-- DEPLOYMENT STOP CONDITION: drain every legacy activity writer/worker and pause all
-- activity writes before running this migration. SQL cannot prove external quiescence.
-- Keep writes paused until this transaction commits and the parent-authority app is live.
select pg_advisory_xact_lock(hashtextextended('gradientpeak.activity-extension-cutover',0));
do $$
begin
  if to_regclass('public.activity_imports') is not null then
    if exists (
      select 1 from public.activity_imports i left join public.activities a on a.id = i.activity_id
      where a.id is null or i.profile_id <> a.profile_id
         or (a.provider is not null and i.provider is not null and a.provider <> i.provider)
         or (a.external_id is not null and i.external_id is not null and a.external_id <> i.external_id)
    ) then raise exception 'activity consolidation conflict: import identity/profile/orphan mismatch'; end if;
    if exists (
      select 1 from public.activity_imports
      where (provider is null) <> (external_id is null)
         or (import_file_type is not null and btrim(import_file_type) = '')
         or (import_original_file_name is not null and btrim(import_original_file_name) = '')
         or (import_source is not null and import_source <> 'manual_historical')
    ) then raise exception 'activity consolidation conflict: invalid import metadata'; end if;
    if exists (
      select provider, external_id from public.activity_imports
      where provider is not null and external_id is not null group by 1, 2 having count(*) > 1
    ) then raise exception 'activity consolidation conflict: duplicate provider identity'; end if;
  end if;
  if to_regclass('public.activity_summaries') is not null and exists (
    select 1 from public.activity_summaries s left join public.activities a on a.id = s.activity_id
    where a.id is null or s.profile_id <> a.profile_id or s.distance_meters < 0 or s.duration_seconds < 0
       or s.moving_seconds < 0 or s.moving_seconds > s.duration_seconds
  ) then raise exception 'activity consolidation conflict: invalid summary/profile/orphan'; end if;
  if to_regclass('public.activity_geometry') is not null and exists (
    select 1 from public.activity_geometry g left join public.activities a on a.id = g.activity_id
    where a.id is null or g.profile_id <> a.profile_id
  ) then raise exception 'activity consolidation conflict: geometry profile/orphan mismatch'; end if;
  if to_regclass('public.activity_laps') is not null and exists (
    select 1 from public.activity_laps l left join public.activities a on a.id = l.activity_id
    where a.id is null or l.profile_id <> a.profile_id or l.payload is null or l.lap_index < 0
  ) then raise exception 'activity consolidation conflict: invalid lap/profile/orphan'; end if;
  if to_regclass('public.activity_laps') is not null and exists (
    select 1 from (select activity_id, count(*) lap_count,
      pg_column_size(jsonb_agg(payload order by lap_index)) payload_size
      from public.activity_laps group by activity_id) diagnostics
    where lap_count > 1000 or payload_size > 1048576
  ) then raise exception 'activity consolidation conflict: laps exceed count/size policy'; end if;
end $$;

do $$
begin
  if to_regclass('public.activity_summaries') is not null then
    update public.activities a set
      duration_seconds=coalesce(s.duration_seconds,a.duration_seconds), moving_seconds=coalesce(s.moving_seconds,a.moving_seconds),
      distance_meters=coalesce(s.distance_meters,a.distance_meters), elevation_gain_meters=coalesce(s.elevation_gain_meters,a.elevation_gain_meters),
      elevation_loss_meters=coalesce(s.elevation_loss_meters,a.elevation_loss_meters), calories=coalesce(s.calories,a.calories),
      avg_heart_rate=coalesce(s.avg_heart_rate,a.avg_heart_rate), max_heart_rate=coalesce(s.max_heart_rate,a.max_heart_rate),
      avg_power=coalesce(s.avg_power,a.avg_power), max_power=coalesce(s.max_power,a.max_power), normalized_power=coalesce(s.normalized_power,a.normalized_power),
      avg_cadence=coalesce(s.avg_cadence,a.avg_cadence), max_cadence=coalesce(s.max_cadence,a.max_cadence),
      avg_speed_mps=coalesce(s.avg_speed_mps,a.avg_speed_mps), max_speed_mps=coalesce(s.max_speed_mps,a.max_speed_mps),
      normalized_speed_mps=coalesce(s.normalized_speed_mps,a.normalized_speed_mps),
      normalized_graded_speed_mps=coalesce(s.normalized_graded_speed_mps,a.normalized_graded_speed_mps),
      avg_temperature=coalesce(s.avg_temperature,a.avg_temperature), avg_swolf=coalesce(s.avg_swolf,a.avg_swolf),
      efficiency_factor=coalesce(s.efficiency_factor,a.efficiency_factor), aerobic_decoupling=coalesce(s.aerobic_decoupling,a.aerobic_decoupling),
      pool_length=coalesce(s.pool_length,a.pool_length), total_strokes=coalesce(s.total_strokes,a.total_strokes)
    from public.activity_summaries s where a.id=s.activity_id;
  end if;
  if to_regclass('public.activity_imports') is not null then
    update public.activities a set
      provider=coalesce(i.provider,a.provider), external_id=coalesce(i.external_id,a.external_id),
      device_manufacturer=coalesce(i.device_manufacturer,a.device_manufacturer),
      device_product=coalesce(i.device_product,a.device_product),
      activity_file_path=coalesce(i.activity_file_path,a.activity_file_path),
      activity_file_size=coalesce(i.activity_file_size,a.activity_file_size),
      import_source=coalesce(i.import_source,a.import_source),
      import_file_type=coalesce(i.import_file_type,a.import_file_type),
      import_original_file_name=coalesce(i.import_original_file_name,a.import_original_file_name)
    from public.activity_imports i where a.id=i.activity_id;
  end if;
  if to_regclass('public.activity_geometry') is not null then
    update public.activities a set polyline=coalesce(g.polyline,a.polyline),
      map_bounds=coalesce(g.map_bounds,a.map_bounds)
    from public.activity_geometry g where a.id=g.activity_id;
  end if;
  if to_regclass('public.activity_laps') is not null then
    update public.activities a set laps=x.laps from (
      select activity_id, jsonb_agg(payload order by lap_index) as laps
      from public.activity_laps group by activity_id
    ) x where a.id=x.activity_id;
  end if;
end $$;

update public.activities set laps='[]'::jsonb where laps is null;
alter table public.activities alter column laps set default '[]'::jsonb;
alter table public.activities alter column laps set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='activities_distance_meters_check') then alter table public.activities add constraint activities_distance_meters_check check (distance_meters >= 0); end if;
  if not exists (select 1 from pg_constraint where conname='activities_duration_seconds_check') then alter table public.activities add constraint activities_duration_seconds_check check (duration_seconds >= 0); end if;
  if not exists (select 1 from pg_constraint where conname='activities_moving_seconds_check') then alter table public.activities add constraint activities_moving_seconds_check check (moving_seconds >= 0); end if;
  if not exists (select 1 from pg_constraint where conname='activities_moving_time_check') then alter table public.activities add constraint activities_moving_time_check check (moving_seconds <= duration_seconds); end if;
  if not exists (select 1 from pg_constraint where conname='activities_import_file_type_non_empty_check') then alter table public.activities add constraint activities_import_file_type_non_empty_check check (import_file_type is null or btrim(import_file_type) <> ''); end if;
  if not exists (select 1 from pg_constraint where conname='activities_import_original_file_name_non_empty_check') then alter table public.activities add constraint activities_import_original_file_name_non_empty_check check (import_original_file_name is null or btrim(import_original_file_name) <> ''); end if;
  if not exists (select 1 from pg_constraint where conname='activities_import_source_check') then alter table public.activities add constraint activities_import_source_check check (import_source is null or import_source = 'manual_historical'); end if;
  if not exists (select 1 from pg_constraint where conname='activities_provider_identity_check') then alter table public.activities add constraint activities_provider_identity_check check ((provider is null) = (external_id is null)); end if;
  if not exists (select 1 from pg_constraint where conname='activities_laps_array_check') then alter table public.activities add constraint activities_laps_array_check check (jsonb_typeof(laps) = 'array'); end if;
  if not exists (select 1 from pg_constraint where conname='activities_laps_count_check') then alter table public.activities add constraint activities_laps_count_check check (jsonb_array_length(laps) <= 1000); end if;
  if not exists (select 1 from pg_constraint where conname='activities_laps_size_check') then alter table public.activities add constraint activities_laps_size_check check (pg_column_size(laps) <= 1048576); end if;
end $$;

create unique index if not exists idx_activities_provider_external_unique on public.activities(provider,external_id) where provider is not null and external_id is not null;
create index if not exists idx_activities_provider_external on public.activities(provider,external_id) where external_id is not null;
create index if not exists idx_activities_activity_file_path on public.activities(activity_file_path) where activity_file_path is not null;
