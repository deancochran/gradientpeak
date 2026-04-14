alter table public.activity_plans
add column if not exists is_public boolean not null default false;
