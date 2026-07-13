create index if not exists idx_activity_file_ingestions_activity_profile
  on public.activity_file_ingestions(activity_id, profile_id);

create index if not exists idx_activity_geometry_activity_profile
  on public.activity_geometry(activity_id, profile_id);

create index if not exists idx_activity_imports_activity_profile
  on public.activity_imports(activity_id, profile_id);

create index if not exists idx_activity_laps_activity_profile
  on public.activity_laps(activity_id, profile_id);

create index if not exists idx_activity_summaries_activity_profile
  on public.activity_summaries(activity_id, profile_id);

create index if not exists idx_event_external_links_event_profile
  on public.event_external_links(event_id, profile_id);

create index if not exists idx_event_payloads_event_profile
  on public.event_payloads(event_id, profile_id);

create index if not exists idx_event_recurrence_event_profile
  on public.event_recurrence(event_id, profile_id);

create index if not exists idx_event_schedule_links_event_profile
  on public.event_schedule_links(event_id, profile_id);
