alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text;

update public.profiles as p
set
  email = coalesce(p.email, u.email),
  full_name = coalesce(
    p.full_name,
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(u.email, '@', 1)
  )
from auth.users as u
where u.id = p.id
  and (
    p.email is distinct from coalesce(p.email, u.email)
    or p.full_name is distinct from coalesce(
      p.full_name,
      nullif(u.raw_user_meta_data ->> 'name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      split_part(u.email, '@', 1)
    )
  );

create unique index if not exists profiles_email_unique_idx
  on public.profiles (email)
  where email is not null;
