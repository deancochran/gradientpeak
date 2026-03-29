# Mobile flow catalog

This catalog maps the interaction inventory to Maestro flow files so broad mobile user-flow coverage has an explicit home before the flows are fully validated.

## Auth and session

- `flows/main/auth_navigation.yaml`
- `flows/main/sign_up_to_verify.yaml`
- `flows/main/verify_resend.yaml`
- `flows/main/forgot_password.yaml`
- `flows/main/onboarding_happy_path.yaml`
- `flows/journeys/auth/onboarding_skip_path.yaml`
- `flows/main/tabs_smoke.yaml`

## Feed, activities, and social

- `flows/journeys/activities/list_screen_open.yaml`
- `flows/journeys/activities/detail_open.yaml`
- `flows/journeys/social/follow_target_from_profile.yaml`
- `flows/journeys/social/activity_detail_like_and_comment.yaml`

## Discover

- `flows/main/discover_user_profile.yaml`
- `flows/journeys/discover/profile_detail_open.yaml`
- `flows/journeys/discover/activity_plan_detail_open.yaml`
- `flows/journeys/discover/route_detail_open.yaml`
- `flows/journeys/plans/activity_plan_schedule_from_discover.yaml`
- `flows/journeys/plans/training_plan_schedule_from_discover.yaml`

## Messaging and notifications

- `flows/journeys/messaging/inbox_open.yaml`
- `flows/journeys/messaging/direct_message_from_profile.yaml`
- `flows/journeys/profile/direct_message_from_profile_v2.yaml`
- `flows/journeys/notifications/inbox_open.yaml`
- `flows/journeys/notifications/read_all.yaml`

## Profile, account, and settings

- `flows/main/profile_screen.yaml`
- `flows/journeys/profile/profile_to_activities_routes.yaml`
- `flows/journeys/profile/edit_screen_open.yaml`
- `flows/journeys/profile/account_settings_update.yaml`
- `flows/journeys/profile/sign_out.yaml`
- `flows/journeys/profile/training_preferences_screen_open.yaml`
- `flows/journeys/profile/integrations_screen_open.yaml`
- `flows/journeys/profile/integrations_import_entry_open.yaml`
- `flows/journeys/plans/preferences_screen_open.yaml`

## Plans, goals, and training plans

- `flows/main/plan_projection_settings.yaml`
- `flows/journeys/plans/list_screen_open.yaml`
- `flows/journeys/plans/training_plan_detail_open.yaml`
- `flows/journeys/training-plans/create_screen_open.yaml`
- `flows/journeys/activity-plans/shared_duplicate_schedule_remove.yaml`
- `flows/journeys/training-plans/shared_duplicate_schedule_plan_sync.yaml`

## Calendar and scheduling

- `flows/main/calendar_custom_event.yaml`
- `flows/journeys/calendar/custom_event_create_edit_delete.yaml`
- `flows/journeys/calendar/recurring_event_reschedule_scopes.yaml`
- `flows/journeys/calendar/scheduled_event_open_and_start_record.yaml`

## Recording

- `flows/main/record_activity_selection.yaml`
- `flows/main/record_quick_start.yaml`
- `flows/journeys/record/quick_start_pause_resume_finish.yaml`
- `flows/journeys/record/attach_plan_before_start.yaml`
- `flows/journeys/record/route_based_start_and_preview.yaml`
- `flows/journeys/record/permissions_and_continue_without_metrics.yaml`

## Routes

- `flows/journeys/routes/list_screen_open.yaml`
- `flows/journeys/routes/detail_open.yaml`
- `flows/journeys/routes/upload_select_and_delete.yaml`

## Integrations and imports

- `flows/journeys/integrations/provider_connect_disconnect.yaml`
- `flows/journeys/integrations/historical_fit_import.yaml`

## Resilience

- `flows/journeys/resilience/sign_in_invalid_spam_guard.yaml`
- `flows/journeys/resilience/warm_relaunch_authenticated.yaml`

## Notes

- These flows are the intended runtime catalog, not a claim that every file has already been executed on the current branch.
- Supporting `flows/reusable/*.yaml` helpers are intentionally not listed here.
- `flows/main/ui_preview.yaml` remains a supporting preview-only flow and is not mapped to the interaction inventory.
- Use this alongside `apps/mobile/docs/INTERACTION_INVENTORY.md` when deciding where to add the next validated journey.
