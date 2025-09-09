drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
    base_username text;
    unique_suffix text;
    final_username text;
begin
    base_username := coalesce(
        nullif(concat_ws('',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        ), ''),
        split_part(new.email, '@', 1)
    );

    unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
    final_username := left(base_username || unique_suffix, 50);

    insert into public.profiles (id, username, avatar_url)
    values (
        new.id,
        final_username,
        new.raw_user_meta_data->>'avatar_url'
    );

    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
