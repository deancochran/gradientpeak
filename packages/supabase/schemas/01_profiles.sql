-- Use Postgres to create a bucket.
insert into storage.buckets
  (id, name, public)
values
  ('profile-avatars', 'profile-avatars', true);

create table "profiles" (
  "id" uuid not null references auth.users on delete cascade,
  "avatar_url" text,
  "full_name" text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone default now(),
  primary key (id)
);


-- Enable RLS on profiles table
alter table public.profiles enable row level security;

-- Create policies for profiles table
create policy "Users can view their own profile" 
on "profiles" 
for select 
using (auth.uid() = id);

create policy "Users can update their own profile" 
on "profiles" 
for update 
using (auth.uid() = id);

create policy "Users can insert their own profile" 
on "profiles" 
for insert 
with check (auth.uid() = id);

-- Allow service role to do everything (for the trigger)
create policy "Service role can do everything" 
on "profiles" 
for all 
using (current_setting('role') = 'service_role');

-- function to create a profile when a new user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
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

