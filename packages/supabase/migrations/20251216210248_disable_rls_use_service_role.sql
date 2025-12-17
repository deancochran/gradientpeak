-- Disable RLS and drop policies
-- Backend now uses SERVICE ROLE KEY for database access
-- Authorization is handled at application layer via tRPC middleware

-- Drop all RLS policies if they exist
drop policy if exists "Users can manage their own profile" on public.profiles;
drop policy if exists "Users can manage their own activities" on public.activities;
drop policy if exists "Users can manage their own activity plans" on public.activity_plans;
drop policy if exists "Users can manage their own routes" on public.activity_routes;
drop policy if exists "Users can manage their own activity streams" on public.activity_streams;
drop policy if exists "Users can manage their own integrations" on public.integrations;
drop policy if exists "Users can manage their own oauth states" on public.oauth_states;
drop policy if exists "Users can manage their own planned activities" on public.planned_activities;
drop policy if exists "Users can manage their own synced planned activities" on public.synced_planned_activities;
drop policy if exists "Users can manage their own training plans" on public.training_plans;

-- Disable RLS on all tables
alter table public.activities disable row level security;
alter table public.activity_plans disable row level security;
alter table public.activity_routes disable row level security;
alter table public.activity_streams disable row level security;
alter table public.integrations disable row level security;
alter table public.oauth_states disable row level security;
alter table public.planned_activities disable row level security;
alter table public.profiles disable row level security;
alter table public.synced_planned_activities disable row level security;
alter table public.training_plans disable row level security;
