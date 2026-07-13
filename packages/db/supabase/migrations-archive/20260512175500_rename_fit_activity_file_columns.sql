do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'fit_file_path'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'activity_file_path'
  ) then
    alter table public.activities rename column fit_file_path to activity_file_path;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'fit_file_size'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'activity_file_size'
  ) then
    alter table public.activities rename column fit_file_size to activity_file_size;
  end if;
end $$;
