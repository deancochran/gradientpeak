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
  insert into public.activity_segments(id,activity_id,profile_id,ordinal,role,category,start_offset_ms,end_offset_ms,
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
  if (
    select count(*) from public.activity_efforts
    where id in (
      '12222222-2222-4222-8222-222222222222',
      '12333333-3333-4333-8333-333333333333'
    ) and value = 0 and source = 'manual' and method = 'profile_update_override'
      and provenance ->> 'override_state' = 'cleared'
  ) <> 2 then
    raise exception 'pre-cut cleared zero tombstones were not preserved: %', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'value', value, 'source', source, 'method', method, 'provenance', provenance
      ) order by id), '[]'::jsonb)
      from public.activity_efforts
      where id in (
        '12222222-2222-4222-8222-222222222222',
        '12333333-3333-4333-8333-333333333333'
      )
    );
  end if;
  insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
    effort_type,duration_seconds,unit,value,source,method,provenance)
  values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
    'manual','profile_update_override','{"override_state":"cleared"}'::jsonb);
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      null,'profile_update_override','{"override_state":"cleared"}'::jsonb);
    raise exception 'zero effort with null source was accepted';
  exception when others then
    if sqlerrm='zero effort with null source was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual',null,'{"override_state":"cleared"}'::jsonb);
    raise exception 'zero effort with null method was accepted';
  exception when others then
    if sqlerrm='zero effort with null method was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual','profile_update_override',null);
    raise exception 'zero effort with null provenance was accepted';
  exception when others then
    if sqlerrm='zero effort with null provenance was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual','profile_update_override','{}'::jsonb);
    raise exception 'zero effort without override state was accepted';
  exception when others then
    if sqlerrm='zero effort without override state was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual','profile_update_override','{"override_state":null}'::jsonb);
    raise exception 'zero effort with null override state was accepted';
  exception when others then
    if sqlerrm='zero effort with null override state was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual','manual_activity_effort_entry','{"override_state":"cleared"}'::jsonb);
    raise exception 'generic zero effort was accepted';
  exception when others then
    if sqlerrm='generic zero effort was accepted' then raise; end if;
  end;
  begin
    insert into public.activity_efforts(id,created_at,profile_id,recorded_at,activity_category,
      effort_type,duration_seconds,unit,value,source,method,provenance)
    values(gen_random_uuid(),now(),profile,now(),'bike','power',1200,'watts',0,
      'manual','profile_update_override','{"override_state":"active"}'::jsonb);
    raise exception 'active zero override was accepted';
  exception when others then
    if sqlerrm='active zero override was accepted' then raise; end if;
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
  perform public.request_activity_artifact_deletion(artifact_two);
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
