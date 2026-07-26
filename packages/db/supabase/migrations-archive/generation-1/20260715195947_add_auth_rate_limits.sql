-- add auth rate limits
create table if not exists public.rate_limits (
  id text primary key,
  key text not null unique,
  count integer not null,
  last_request bigint not null
);

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;
