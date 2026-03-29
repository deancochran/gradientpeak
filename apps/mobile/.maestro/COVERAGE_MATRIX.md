# Mobile E2E coverage matrix

This matrix translates `apps/mobile/docs/INTERACTION_INVENTORY.md` into concrete Maestro ownership.

Status meanings:

- `validated`: existing flow intended to be part of the active suite
- `scaffold`: flow file exists, but still needs runtime hardening or first validation
- `partial`: some entry coverage exists, but the inventory area is not yet represented by a full journey set

## Auth and session

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Auth navigation and sign in | `flows/main/auth_navigation.yaml` | validated |
| Sign up and verify | `flows/main/sign_up_to_verify.yaml`, `flows/main/verify_resend.yaml` | validated |
| Forgot/reset entry | `flows/main/forgot_password.yaml` | validated |
| Onboarding happy path | `flows/main/onboarding_happy_path.yaml` | validated |
| Onboarding skip-heavy path | `flows/journeys/auth/onboarding_skip_path.yaml` | validated |
| Authenticated tab gate | `flows/main/tabs_smoke.yaml` | validated |

## Feed, discover, and social

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Discover profile open | `flows/journeys/discover/profile_detail_open.yaml` | validated |
| Discover activity-plan open | `flows/journeys/discover/activity_plan_detail_open.yaml` | scaffold |
| Discover route open | `flows/journeys/discover/route_detail_open.yaml` | scaffold |
| Activity list and detail open | `flows/journeys/activities/list_screen_open.yaml`, `flows/journeys/activities/detail_open.yaml` | validated |
| Follow/unfollow from profile | `flows/journeys/social/follow_target_from_profile.yaml` | validated |
| Activity detail like/comment | `flows/journeys/social/activity_detail_like_and_comment.yaml` | scaffold |

## Messaging and notifications

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Inbox open | `flows/journeys/messaging/inbox_open.yaml` | validated |
| DM from profile | `flows/journeys/messaging/direct_message_from_profile.yaml`, `flows/journeys/profile/direct_message_from_profile_v2.yaml` | partial |
| Notifications open | `flows/journeys/notifications/inbox_open.yaml` | validated |
| Notifications mark-all-read | `flows/journeys/notifications/read_all.yaml` | scaffold |

## Profile, account, and settings

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Profile activity and route entry points | `flows/journeys/profile/profile_to_activities_routes.yaml` | validated |
| Profile edit open | `flows/journeys/profile/edit_screen_open.yaml` | validated |
| Account settings entry points | `flows/journeys/profile/account_settings_open.yaml` | scaffold |
| Activity efforts entry | `flows/journeys/profile/activity_efforts_open.yaml` | scaffold |
| Sign out | `flows/journeys/profile/sign_out.yaml` | validated |
| Training preferences open | `flows/journeys/profile/training_preferences_screen_open.yaml`, `flows/journeys/plans/preferences_screen_open.yaml` | validated |
| Integrations screen and import entry | `flows/journeys/profile/integrations_screen_open.yaml`, `flows/journeys/profile/integrations_import_entry_open.yaml`, `flows/journeys/integrations/historical_fit_import.yaml` | partial |

## Plans, goals, calendar, and scheduling

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Plan tab and current projection | `flows/main/plan_screen.yaml`, `flows/main/plan_projection_settings.yaml` | partial |
| Goal entry | `flows/journeys/plans/goal_entry_open.yaml` | scaffold |
| Training plans list/detail | `flows/journeys/plans/list_screen_open.yaml`, `flows/journeys/plans/training_plan_detail_open.yaml` | validated |
| Training-plan discover schedule sync | `flows/journeys/plans/training_plan_schedule_from_discover.yaml`, `flows/journeys/training-plans/shared_duplicate_schedule_plan_sync.yaml` | validated |
| Activity-plan discover schedule/remove | `flows/journeys/plans/activity_plan_schedule_from_discover.yaml`, `flows/journeys/activity-plans/shared_duplicate_schedule_remove.yaml` | validated |
| Calendar custom-event CRUD | `flows/journeys/calendar/custom_event_create_edit_delete.yaml` | validated |
| Calendar recurring reschedule scopes | `flows/journeys/calendar/recurring_event_reschedule_scopes.yaml` | scaffold |
| Calendar scheduled-event to record | `flows/journeys/calendar/scheduled_event_open_and_start_record.yaml` | scaffold |

## Recording, routes, and submission

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Activity selection and quick start | `flows/main/record_activity_selection.yaml`, `flows/main/record_quick_start.yaml` | validated |
| Pause/resume/finish | `flows/journeys/record/quick_start_pause_resume_finish.yaml` | scaffold |
| Attach plan before start | `flows/journeys/record/attach_plan_before_start.yaml` | scaffold |
| Route-based start and preview | `flows/journeys/record/route_based_start_and_preview.yaml` | scaffold |
| Continue without required metrics | `flows/journeys/record/permissions_and_continue_without_metrics.yaml` | scaffold |
| Routes list/detail | `flows/journeys/routes/list_screen_open.yaml`, `flows/journeys/routes/detail_open.yaml` | validated |
| Route upload entry | `flows/journeys/routes/upload_entry_open.yaml` | scaffold |

## Resilience

| Inventory area | Maestro flows | Status |
| --- | --- | --- |
| Invalid auth spam guard | `flows/journeys/resilience/sign_in_invalid_spam_guard.yaml` | validated |
| Warm relaunch authenticated | `flows/journeys/resilience/warm_relaunch_authenticated.yaml` | validated |

## Highest remaining gaps after this pass

- Multi-actor notification truth after DM send remains only partially represented.
- Recording sensors and FTMS still need dedicated journeys beyond the current recorder-start variants.
- Routes upload and historical FIT import exist as scaffolds, but need runtime fixture support before validation.
- Goal detail, follower/following lists, and scheduled-activities-list still need stronger selector-backed journeys.
