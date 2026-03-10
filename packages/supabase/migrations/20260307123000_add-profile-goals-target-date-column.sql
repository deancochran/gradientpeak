alter table if exists public.profile_goals
    add column if not exists target_date date;
