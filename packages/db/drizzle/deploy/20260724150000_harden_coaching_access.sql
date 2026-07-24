-- Preserve coaching relationship history while making revocation explicit.
-- Existing rows remain active without a backfill; new rows start at revision 1.
alter table public.coaches_athletes
  add column if not exists revoked_at timestamp with time zone,
  add column if not exists revision integer not null default 1,
  add constraint coaches_athletes_revision_positive check (revision > 0);

create index if not exists idx_coaches_athletes_active_lookup
  on public.coaches_athletes (coach_id, athlete_id)
  where revoked_at is null;

-- Durable, bounded fixed-window counters for the general API abuse boundary.
create table if not exists public.api_rate_limit_windows (
  key_hash text not null,
  window_started_at timestamp with time zone not null,
  count integer not null check (count > 0),
  expires_at timestamp with time zone not null,
  primary key (key_hash, window_started_at)
);

create index if not exists idx_api_rate_limit_windows_expiry
  on public.api_rate_limit_windows (expires_at);

alter table public.api_rate_limit_windows enable row level security;
revoke all on table public.api_rate_limit_windows from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_windows to service_role;
