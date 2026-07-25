-- Credential mutations are fenced by generation; this constant default is metadata-only
-- on supported PostgreSQL versions and requires no table scan or backfill.
alter table public.integration_credentials
  add column if not exists generation integer not null default 1,
  add column if not exists reconnect_required_at timestamp with time zone,
  add constraint integration_credentials_generation_positive check (generation > 0) not valid;

-- OAuth states created before this rollout remain readable only long enough to expire;
-- application writes bind every new state to the server-derived callback, scopes, and PKCE verifier.
alter table public.oauth_states
  add column if not exists callback_uri text,
  add column if not exists requested_scope text,
  add column if not exists verifier_hash text;
