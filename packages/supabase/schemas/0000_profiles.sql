create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  idx serial unique,
  gender text,
  dob date,
  username text unique,
  language text default 'en',
  preferred_units text default 'metric',
  avatar_url text,
  bio text,
  onboarded boolean default false,
  threshold_hr integer,
  ftp integer,
  weight_kg integer,
  created_at timestamp not null default now()
);
