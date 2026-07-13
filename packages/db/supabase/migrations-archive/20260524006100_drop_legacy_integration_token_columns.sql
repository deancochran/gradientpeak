alter table if exists public.integrations
  drop column if exists access_token,
  drop column if exists refresh_token,
  drop column if exists expires_at,
  drop column if exists scope;
