begin;

create or replace function public.validate_activity_segment_set(target_activity_id uuid) returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  parent_record record;
  segment_count integer;
  max_ordinal integer;
  summed_active bigint;
  summed_moving bigint;
  complete_count integer;
begin
  select elapsed_ms, active_ms, moving_ms, timing_coverage,
    entry_provenance, manual_activity_category, diary_date, diary_timezone,
    started_at, finished_at
    into parent_record
  from public.activities where id = target_activity_id;
  if not found then return; end if;

  -- Manual diary observations are scalar evidence. The immediate manual
  -- contract check owns their nullable measurement fields; they have no segment set.
  if parent_record.entry_provenance = 'manual'
    and parent_record.manual_activity_category is not null
    and parent_record.diary_date is not null
    and parent_record.diary_timezone is not null
    and ((parent_record.started_at is null and parent_record.finished_at is null)
      or (parent_record.started_at is not null and parent_record.finished_at is not null)) then
    return;
  end if;

  select count(*), max(ordinal), sum(active_ms), sum(moving_ms),
    count(*) filter(where timing_coverage='complete' and active_ms is not null and moving_ms is not null)
    into segment_count, max_ordinal, summed_active, summed_moving, complete_count
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

commit;
