create table "profiles" (
  "id" uuid not null default gen_random_uuid(),
  "avatar_url" text,
  "full_name" text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone default now(),
  constraint "profiles_pkey" primary key ("id"),
  constraint "profiles_auth_fk" foreign key ("id") references "auth"."users"("id") on delete cascade
);

-- function to create a profile when a new user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    concat_ws(' ',
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


-- trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

