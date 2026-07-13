-- Low-risk FK-covering indexes identified by database advisor output.
create index if not exists idx_activity_efforts_activity_id on public.activity_efforts (activity_id);
create index if not exists idx_activity_efforts_profile_id on public.activity_efforts (profile_id);
create index if not exists idx_activity_plan_refresh_queue_activity_plan_id on public.activity_plan_refresh_queue (activity_plan_id);
create index if not exists idx_content_access_grants_actor_profile_id on public.content_access_grants (actor_profile_id) where actor_profile_id is not null;
create index if not exists idx_conversation_participants_user_id on public.conversation_participants (user_id);
create index if not exists idx_events_linked_activity_id on public.events (linked_activity_id) where linked_activity_id is not null;
create index if not exists idx_events_route_id on public.events (route_id) where route_id is not null;
create index if not exists idx_group_event_activity_plans_activity_plan_id on public.group_event_activity_plans (activity_plan_id);
create index if not exists idx_group_event_rsvps_selected_activity_plan_id on public.group_event_rsvps (selected_group_event_activity_plan_id) where selected_group_event_activity_plan_id is not null;
create index if not exists idx_group_events_created_by_profile_id on public.group_events (created_by_profile_id) where created_by_profile_id is not null;
create index if not exists idx_group_events_route_id on public.group_events (route_id) where route_id is not null;
create index if not exists idx_group_join_requests_profile_id on public.group_join_requests (profile_id);
create index if not exists idx_groups_created_by_profile_id on public.groups (created_by_profile_id);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_notifications_actor_id on public.notifications (actor_id);
create index if not exists idx_provider_sync_jobs_integration_id on public.provider_sync_jobs (integration_id);
create index if not exists idx_provider_sync_jobs_profile_id on public.provider_sync_jobs (profile_id);
create index if not exists idx_provider_sync_jobs_supersedes_job_id on public.provider_sync_jobs (supersedes_job_id) where supersedes_job_id is not null;
create index if not exists idx_provider_webhook_receipts_integration_id on public.provider_webhook_receipts (integration_id) where integration_id is not null;

alter function if exists public.invoke_wahoo_provider_sync_drain() set search_path = public, extensions, vault, pg_catalog;
