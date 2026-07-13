alter table if exists public.accounts enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.verifications enable row level security;
alter table if exists public.integrations enable row level security;
alter table if exists public.oauth_states enable row level security;
alter table if exists public.integration_resource_links enable row level security;
alter table if exists public.provider_sync_jobs enable row level security;
alter table if exists public.provider_sync_state enable row level security;
alter table if exists public.provider_webhook_receipts enable row level security;

revoke all on public.accounts from public, anon, authenticated;
revoke all on public.sessions from public, anon, authenticated;
revoke all on public.verifications from public, anon, authenticated;
revoke all on public.oauth_states from public, anon, authenticated;
revoke all on public.integration_resource_links from public, anon, authenticated;
revoke all on public.provider_sync_jobs from public, anon, authenticated;
revoke all on public.provider_sync_state from public, anon, authenticated;
revoke all on public.provider_webhook_receipts from public, anon, authenticated;

grant select, insert, update, delete on public.accounts to service_role;
grant select, insert, update, delete on public.sessions to service_role;
grant select, insert, update, delete on public.verifications to service_role;
grant select, insert, update, delete on public.oauth_states to service_role;
grant select, insert, update, delete on public.integration_resource_links to service_role;
grant select, insert, update, delete on public.provider_sync_jobs to service_role;
grant select, insert, update, delete on public.provider_sync_state to service_role;
grant select, insert, update, delete on public.provider_webhook_receipts to service_role;
