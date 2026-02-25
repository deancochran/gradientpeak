alter table public.profiles
  add column gender text;

alter table public.profiles
  add constraint profiles_gender_check
  check (gender in ('male', 'female'));
