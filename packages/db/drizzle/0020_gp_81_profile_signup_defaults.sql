ALTER TABLE "profiles" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "is_public" SET DEFAULT false;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
    full_name text;
    user_email text;
    base_username text;
    unique_suffix text;
    final_username text;
begin
    full_name := nullif(btrim(coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        concat_ws(' ',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        )
    )), '');

    user_email := coalesce(
        nullif(new.email, ''),
        nullif(new.raw_user_meta_data->>'email', ''),
        new.id::text || '@users.local'
    );

    base_username := coalesce(
        nullif(concat_ws('',
            new.raw_user_meta_data->>'first_name',
            new.raw_user_meta_data->>'last_name'
        ), ''),
        split_part(user_email, '@', 1),
        'user'
    );

    unique_suffix := substring(replace(new.id::text, '-', '') from 1 for 6);
    final_username := left(base_username || unique_suffix, 50);

    insert into public.users (id, name, email, email_verified, image)
    values (
        new.id,
        coalesce(full_name, split_part(user_email, '@', 1), 'User'),
        user_email,
        coalesce(new.email_confirmed_at is not null, false),
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        name = coalesce(public.users.name, excluded.name),
        email = coalesce(public.users.email, excluded.email),
        image = coalesce(public.users.image, excluded.image),
        updated_at = now();

    insert into public.profiles (id, email, full_name, username, avatar_url)
    values (
        new.id,
        new.email,
        full_name,
        final_username,
        new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do update
    set
        email = coalesce(public.profiles.email, excluded.email),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        username = coalesce(public.profiles.username, excluded.username),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

    return new;
end;
$$;
