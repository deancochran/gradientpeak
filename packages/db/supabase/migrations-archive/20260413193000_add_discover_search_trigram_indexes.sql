create extension if not exists pg_trgm;

create index if not exists idx_profiles_username_trgm
on public.profiles using gin (username gin_trgm_ops)
where username is not null;

create index if not exists idx_activity_plans_name_trgm
on public.activity_plans using gin (name gin_trgm_ops);

create index if not exists idx_activity_routes_name_trgm
on public.activity_routes using gin (name gin_trgm_ops);
