-- add profile planning timezone
alter table public.profiles
  add column planning_timezone text;
