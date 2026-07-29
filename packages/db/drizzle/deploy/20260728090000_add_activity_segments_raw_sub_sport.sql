do $$
declare
  invalid_count bigint;
begin
  select count(*)
    into invalid_count
    from public.activity_segments
   where (raw_type_string is not null and char_length(raw_type_string) not between 1 and 128)
      or (raw_sport_string is not null and char_length(raw_sport_string) not between 1 and 128);

  if invalid_count <> 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'Activity segment raw-source migration aborted: %s row(s) contain empty or oversized legacy raw source strings.',
        invalid_count
      ),
      hint = 'Explicitly clean up the reported legacy raw source values before retrying; this migration performs no rewrite or deletion.';
  end if;
end
$$;

alter table public.activity_segments rename column category to activity_category;

alter table public.activity_segments
  drop constraint activity_segments_unknown_source_check,
  add column raw_sub_sport_string text,
  add column raw_sub_sport_integer integer,
  add constraint activity_segments_unknown_source_check
    check (role <> 'unknown' or num_nonnulls(raw_type_string, raw_type_integer, raw_sport_string, raw_sport_integer, raw_sub_sport_string, raw_sub_sport_integer) > 0),
  add constraint activity_segments_raw_sub_sport_type_check
    check (num_nonnulls(raw_sub_sport_string, raw_sub_sport_integer) <= 1),
  add constraint activity_segments_raw_source_string_bounds_check
    check (
      (raw_type_string is null or char_length(raw_type_string) between 1 and 128)
      and (raw_sport_string is null or char_length(raw_sport_string) between 1 and 128)
      and (raw_sub_sport_string is null or char_length(raw_sub_sport_string) between 1 and 128)
    );

insert into public.canonical_activity_categories(code, display_name, enabled) values
  ('run', 'Run', true),
  ('bike', 'Bike', true),
  ('swim', 'Swim', true),
  ('strength', 'Strength', true),
  ('other', 'Other', true)
on conflict (code) do update set
  display_name = excluded.display_name,
  enabled = excluded.enabled;

alter table public.canonical_activity_categories
  add constraint canonical_activity_categories_code_check
  check (code in ('run', 'bike', 'swim', 'strength', 'other'));

create or replace function public.validate_activity_effort_segment_range() returns trigger
  language plpgsql
  set search_path to ''
  as $$
declare segment_record record;
begin
  if new.activity_id is null then return new; end if;
  select start_offset_ms,end_offset_ms,activity_category into segment_record from public.activity_segments
    where id=new.segment_id and activity_id=new.activity_id and profile_id=new.profile_id;
  if not found or segment_record.activity_category<>new.activity_category
    or new.start_offset is null or new.start_offset*1000<segment_record.start_offset_ms
    or (new.start_offset+new.duration_seconds)*1000>segment_record.end_offset_ms then
    raise exception 'activity effort must be contained by its matching-category segment';
  end if;
  return new;
end $$;
