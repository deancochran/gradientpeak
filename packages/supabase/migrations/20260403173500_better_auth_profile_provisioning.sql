set check_function_bodies = off;

create or replace function public.sync_profile_from_better_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  normalized_full_name text;
  normalized_avatar_url text;
  base_username text;
  unique_suffix text;
  generated_username text;
begin
  if new.id is null
     or new.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Better Auth user id must be a UUID string to provision profiles: %', new.id;
  end if;

  normalized_email := nullif(new.email, '');
  normalized_full_name := coalesce(nullif(new.name, ''), split_part(coalesce(new.email, ''), '@', 1), 'athlete');
  normalized_avatar_url := nullif(new.image, '');
  base_username := lower(regexp_replace(normalized_full_name, '[^a-zA-Z0-9]+', '', 'g'));

  if base_username = '' then
    base_username := 'athlete';
  end if;

  unique_suffix := substring(replace(new.id, '-', '') from 1 for 6);
  generated_username := left(base_username || unique_suffix, 50);

  insert into public.profiles (
    id,
    created_at,
    updated_at,
    email,
    full_name,
    username,
    avatar_url,
    language,
    preferred_units,
    onboarded,
    is_public
  ) values (
    new.id::uuid,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, new.created_at, now()),
    normalized_email,
    normalized_full_name,
    generated_username,
    normalized_avatar_url,
    'en',
    'metric',
    false,
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists on_better_auth_user_created on public.users;
create trigger on_better_auth_user_created
after insert on public.users
for each row execute procedure public.sync_profile_from_better_auth_user();

drop trigger if exists on_better_auth_user_updated on public.users;
create trigger on_better_auth_user_updated
after update of email, name, image, updated_at on public.users
for each row execute procedure public.sync_profile_from_better_auth_user();

insert into public.profiles (
  id,
  created_at,
  updated_at,
  email,
  full_name,
  username,
  avatar_url,
  language,
  preferred_units,
  onboarded,
  is_public
)
select
  u.id::uuid,
  coalesce(u.created_at, now()),
  coalesce(u.updated_at, u.created_at, now()),
  nullif(u.email, ''),
  coalesce(nullif(u.name, ''), split_part(coalesce(u.email, ''), '@', 1), 'athlete'),
  left(
    coalesce(
      nullif(p.username, ''),
      lower(regexp_replace(coalesce(nullif(u.name, ''), split_part(coalesce(u.email, ''), '@', 1), 'athlete'), '[^a-zA-Z0-9]+', '', 'g')) || substring(replace(u.id, '-', '') from 1 for 6)
    ),
    50
  ),
  coalesce(nullif(u.image, ''), p.avatar_url),
  coalesce(p.language, 'en'),
  coalesce(p.preferred_units, 'metric'),
  coalesce(p.onboarded, false),
  coalesce(p.is_public, false)
from public.users u
left join public.profiles p on p.id = u.id::uuid
where u.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = excluded.updated_at;
