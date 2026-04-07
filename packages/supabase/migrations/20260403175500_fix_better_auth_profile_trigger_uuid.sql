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
  normalized_email := nullif(new.email, '');
  normalized_full_name := coalesce(nullif(new.name, ''), split_part(coalesce(new.email, ''), '@', 1), 'athlete');
  normalized_avatar_url := nullif(new.image, '');
  base_username := lower(regexp_replace(normalized_full_name, '[^a-zA-Z0-9]+', '', 'g'));

  if base_username = '' then
    base_username := 'athlete';
  end if;

  unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
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
    new.id,
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
