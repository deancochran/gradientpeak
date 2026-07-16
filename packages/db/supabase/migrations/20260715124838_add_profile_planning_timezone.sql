-- add profile planning timezone
alter table public.profiles
  add column if not exists planning_timezone text;
