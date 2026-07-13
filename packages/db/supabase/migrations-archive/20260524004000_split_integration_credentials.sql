create table if not exists public.integration_credentials (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamp with time zone,
  scope text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_integration_credentials_expires_at
  on public.integration_credentials(expires_at);

insert into public.integration_credentials (
  integration_id,
  access_token,
  refresh_token,
  expires_at,
  scope,
  created_at,
  updated_at
)
select
  id,
  access_token,
  refresh_token,
  expires_at,
  scope,
  created_at,
  updated_at
from public.integrations
on conflict (integration_id) do update set
  access_token = excluded.access_token,
  refresh_token = excluded.refresh_token,
  expires_at = excluded.expires_at,
  scope = excluded.scope,
  updated_at = greatest(public.integration_credentials.updated_at, excluded.updated_at);

alter table public.integration_credentials enable row level security;

revoke all on public.integration_credentials from public;
revoke all on public.integration_credentials from anon;
revoke all on public.integration_credentials from authenticated;
grant select, insert, update, delete on public.integration_credentials to service_role;

drop index if exists public.idx_integrations_expires_at;

alter table public.integrations
  drop column if exists access_token,
  drop column if exists refresh_token,
  drop column if exists expires_at,
  drop column if exists scope;
