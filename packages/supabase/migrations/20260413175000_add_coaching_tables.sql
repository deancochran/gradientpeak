create table if not exists public.coaching_invitations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint coaching_invitations_athlete_coach_unique unique (athlete_id, coach_id)
);

create index if not exists idx_coaching_invitations_athlete_id
on public.coaching_invitations (athlete_id);

create index if not exists idx_coaching_invitations_coach_id
on public.coaching_invitations (coach_id);

create table if not exists public.coaches_athletes (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (coach_id, athlete_id)
);

create index if not exists idx_coaches_athletes_coach_id
on public.coaches_athletes (coach_id);

create index if not exists idx_coaches_athletes_athlete_id
on public.coaches_athletes (athlete_id);
