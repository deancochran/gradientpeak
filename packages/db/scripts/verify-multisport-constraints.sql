do $$
declare
  profile uuid;
  activity uuid := 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  segment uuid := 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  artifact_one uuid := 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee1';
  artifact_two uuid := 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee2';
  disposable_artifact uuid := 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee3';
  digest_one text := repeat('1',64);
  digest_two text := repeat('2',64);
  digest_three text := repeat('3',64);
begin
  select id into profile from public.profiles order by id limit 1;
  if profile is null then raise exception 'constraint fixture requires a profile'; end if;
  insert into public.activities(id,profile_id,name,started_at,finished_at,elapsed_ms,active_ms,moving_ms,
    timing_coverage,parser_version,decoded_contract_version,materializer_version)
  values(activity,profile,'constraint fixture',now(),now()+interval '1 second',1000,1000,1000,
    'complete','fixture','fixture','fixture');
  insert into public.activity_artifacts(id,profile_id,digest,byte_size,bucket,path,media_type,format)
  values
    (artifact_one,profile,digest_one,1,'activity-files','artifacts/sha256/'||profile||'/'||digest_one,'application/octet-stream','fit'),
    (artifact_two,profile,digest_two,1,'activity-files','artifacts/sha256/'||profile||'/'||digest_two,'application/octet-stream','fit'),
    (disposable_artifact,profile,digest_three,1,'activity-files','artifacts/sha256/'||profile||'/'||digest_three,'application/octet-stream','fit');
  insert into public.activity_artifact_links(activity_id,artifact_id,profile_id,role,ordinal,is_current)
  values(activity,artifact_one,profile,'source',0,true);
  perform public.switch_activity_source_artifact(activity,artifact_two,profile,'revision-2');
  if (select count(*) from public.activity_artifact_links where activity_id=activity and role='source')<>2
    or (select count(*) from public.activity_artifact_links where activity_id=activity and role='source' and is_current)<>1
    or (select max(ordinal) from public.activity_artifact_links where activity_id=activity and role='source')<>1 then
    raise exception 'source revision history/current/ordinal contract failed';
  end if;
  insert into public.activity_segments(id,activity_id,profile_id,ordinal,role,activity_category,start_offset_ms,end_offset_ms,
    source_artifact_id,summary,summary_version,timing_coverage,active_ms,moving_ms,parser_version,materializer_version)
  values(segment,activity,profile,0,'activity','run',0,1000,artifact_two,
    '{"version":1,"timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}',1,'complete',1000,1000,'fixture','fixture');
  perform public.validate_activity_segment_set(activity);

  begin
    update public.activities set elapsed_ms=500 where id=activity;
    set constraints activities_validate_segment_set immediate;
    raise exception 'parent timing trigger accepted out-of-bounds segment';
  exception when others then
    if sqlerrm='parent timing trigger accepted out-of-bounds segment' then raise; end if;
  end;
  begin
    update public.activity_segments set timing_coverage='unavailable',active_ms=null,moving_ms=null,
      summary='{"version":1,"timing":{"timingCoverage":"unavailable"}}' where id=segment;
    set constraints activity_segments_validate_set immediate;
    raise exception 'complete parent accepted unavailable segment timing';
  exception when others then
    if sqlerrm='complete parent accepted unavailable segment timing' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,activity_id,segment_id,recorded_at,
      activity_category,effort_type,duration_seconds,start_offset,unit,value)
    values(gen_random_uuid(),now(),profile,activity,segment,now(),'bike','power',1,0,'watts',100);
    raise exception 'effort category mismatch was accepted';
  exception when others then
    if sqlerrm='effort category mismatch was accepted' then raise; end if;
  end;
  insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
    effort_type,duration_seconds,distance_meters,unit,value)
  values
    (gen_random_uuid(),now(),profile,now(),'bike','heart_rate',60,null,'bpm',30),
    (gen_random_uuid(),now(),profile,now(),'run','heart_rate',300,null,'bpm',240),
    (gen_random_uuid(),now(),profile,now(),'swim','heart_rate',600,400,'bpm',150),
    (gen_random_uuid(),now(),profile,now(),'swim','speed',300,1000000,'meters_per_second',1.5);
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'strength','heart_rate',60,'bpm',150);
    raise exception 'unsupported heart-rate category was accepted';
  exception when others then
    if sqlerrm='unsupported heart-rate category was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',60,'W',150);
    raise exception 'legacy power unit was accepted';
  exception when others then
    if sqlerrm='legacy power unit was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'run','heart_rate',60,'watts',150);
    raise exception 'incompatible heart-rate unit was accepted';
  exception when others then
    if sqlerrm='incompatible heart-rate unit was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'run','heart_rate',60,'bpm',29);
    raise exception 'below-bound heart-rate effort was accepted';
  exception when others then
    if sqlerrm='below-bound heart-rate effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'run','heart_rate',60,'bpm',241);
    raise exception 'above-bound heart-rate effort was accepted';
  exception when others then
    if sqlerrm='above-bound heart-rate effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,distance_meters,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'swim','speed',300,0,'meters_per_second',1.5);
    raise exception 'zero effort distance was accepted';
  exception when others then
    if sqlerrm='zero effort distance was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,distance_meters,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'swim','speed',300,1000001,'meters_per_second',1.5);
    raise exception 'above-bound effort distance was accepted';
  exception when others then
    if sqlerrm='above-bound effort distance was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0);
    raise exception 'zero effort was accepted';
  exception when others then
    if sqlerrm='zero effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts','NaN'::real);
    raise exception 'NaN effort was accepted';
  exception when others then
    if sqlerrm='NaN effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts','Infinity'::real);
    raise exception 'positive infinity effort was accepted';
  exception when others then
    if sqlerrm='positive infinity effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts','-Infinity'::real);
    raise exception 'negative infinity effort was accepted';
  exception when others then
    if sqlerrm='negative infinity effort was accepted' then raise; end if;
  end;
  begin
    delete from public.activity_artifacts where id=disposable_artifact;
    raise exception 'direct accepted artifact delete was accepted';
  exception when others then
    if sqlerrm='direct accepted artifact delete was accepted' then raise; end if;
  end;
  begin
    update public.activity_artifacts set availability='deletion_pending',deletion_requested_at=now()
    where id=disposable_artifact;
    raise exception 'direct lifecycle update was accepted';
  exception when others then
    if sqlerrm='direct lifecycle update was accepted' then raise; end if;
  end;
  perform public.request_activity_artifact_deletion(disposable_artifact);
  begin
    perform public.finalize_activity_artifact_deletion(disposable_artifact,false);
    raise exception 'artifact finalized without storage proof';
  exception when others then
    if sqlerrm='artifact finalized without storage proof' then raise; end if;
  end;
  perform public.finalize_activity_artifact_deletion(disposable_artifact,true);
  perform public.purge_deleted_activity_artifact(disposable_artifact);
  if exists(select 1 from public.activity_artifacts where id=disposable_artifact) then
    raise exception 'authorized artifact purge failed';
  end if;
  insert into public.activity_file_ingestions(
    activity_id,artifact_id,profile_id,source,operation_key,status,
    accepted_sha256,accepted_byte_size,accepted_bucket,accepted_path,
    accepted_media_type,accepted_format,uploaded_at
  ) values(
    activity,artifact_two,profile,'manual_import','constraint-artifact-deletion','ready',
    digest_two,1,'activity-files','artifacts/sha256/'||profile||'/'||digest_two,
    'application/octet-stream','fit',now()
  );
  perform public.request_activity_artifact_deletion(artifact_two);
  if exists(
    select 1 from public.activity_file_ingestions
    where operation_key='constraint-artifact-deletion'
      and (status<>'failed' or artifact_id is not null or accepted_sha256 is not null
        or accepted_byte_size is not null or accepted_bucket is not null or accepted_path is not null
        or accepted_media_type is not null or accepted_format is not null or uploaded_at is not null
        or last_error_code<>'artifact_deletion_requested')
  ) then
    raise exception 'artifact deletion did not clear accepted ingestion metadata';
  end if;
  if exists(select 1 from public.activity_artifact_links where artifact_id=artifact_two)
    or exists(select 1 from public.activity_segments where source_artifact_id=artifact_two) then
    raise exception 'linked artifact deletion did not revoke source references';
  end if;
  perform public.finalize_activity_artifact_deletion(artifact_two,true);
  perform public.purge_deleted_activity_artifact(artifact_two);
  if exists(select 1 from public.activity_artifacts where id=artifact_two) then
    raise exception 'linked artifact authorized purge failed';
  end if;
  begin
    delete from public.profiles where id=profile;
    raise exception 'profile delete bypassed artifact retention';
  exception when others then
    if sqlerrm='profile delete bypassed artifact retention' then raise; end if;
  end;
  raise notice 'multisport constraint rejection fixtures passed';
end $$;
