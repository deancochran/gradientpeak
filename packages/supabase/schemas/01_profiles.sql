-- Note: Storage bucket creation moved to seed.sql

create table "profiles" (
    "id" uuid primary key references "auth"."users"("id") on delete cascade,

    -- key fitness metrics
    "threshold_hr" integer,
    "ftp" integer,
    "weight_kg" numeric(5,2),

    -- personal info
    "gender" text check ("gender" in ('male', 'female', 'other')),
    "dob" date,
    "username" text unique,
    "language" text default 'en',
    "preferred_units" text check ("preferred_units" in ('metric', 'imperial')) default 'metric',
    "avatar_url" text,
    "bio" text,

    -- onboarding & measurement tracking
    "onboarded" boolean default false,
    "last_ftp_update" timestamptz,
    "last_threshold_hr_update" timestamptz,

    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz default now()
);



-- RLS policies for profiles table
alter table "profiles" enable row level security;

create policy "Users can manage own profiles" on "profiles"
    for all using (auth.uid() = id);

-- function to create a profile when a new user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(concat_ws(' ',
        new.raw_user_meta_data->>'first_name',
        new.raw_user_meta_data->>'last_name'
      ), ''),
      split_part(new.email, '@', 1) -- fallback to email username
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
