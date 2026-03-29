# Mobile Interaction Inventory

Compact testing-oriented inventory of current mobile user interactions, grouped by user flow and the API surface they exercise.

## Surface Map

- Unauthenticated: `/(external)` welcome, sign-in, sign-up, verify, forgot/reset password, auth callback, auth error, success states, external onboarding.
- Authenticated tabs: `/(internal)/(tabs)` feed, discover, record launcher, plan, calendar.
- Authenticated stack: `/(internal)/(standard)` profile, notifications, messages, activities, routes, activity plans, training plans, goals, integrations, onboarding, preferences.
- Recording stack: `/(internal)/record` activity, plan, route, route preview, sensors, FTMS, submit.

## Auth And Session

- Screens: `apps/mobile/app/(external)/index.tsx`, `apps/mobile/app/(external)/sign-in.tsx`, `apps/mobile/app/(external)/sign-up.tsx`, `apps/mobile/app/(external)/verify.tsx`, `apps/mobile/app/(external)/forgot-password.tsx`, `apps/mobile/app/(external)/reset-password.tsx`, `apps/mobile/app/(external)/callback.tsx`.
- Flows: sign in, sign up, resend verification, verify OTP, start password reset, land from reset deep link, complete auth callback, continue through onboarding.
- API/tRPC: `auth.getUser`, `profiles.get`, `profiles.update`, `profileMetrics.create`.
- System/local: Supabase auth session handling, deep links, token handoff, optional server override, timeout handling.
- Backend-light screens: `auth-error`, `sign-up-success`, `verification-success`.

## Feed And Social Detail

- Screens: `apps/mobile/app/(internal)/(tabs)/index.tsx`, `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`, `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`, `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx`, `apps/mobile/app/(internal)/(standard)/route-detail.tsx`.
- Flows: browse feed, refresh feed, open detail from feed cards, like feed items, like/comment on activity or plan detail.
- API/tRPC: `feed.getFeed`, `social.toggleLike`, `social.getComments`, `social.addComment`, `activities.getById`, `activityPlans.getById`, `trainingPlans.getTemplate`, `routes.get`.
- System/local: infinite list behavior, optimistic like/comment UI, detail routing.

## Discover

- Screens: `apps/mobile/app/(internal)/(tabs)/discover.tsx`, downstream detail/profile routes.
- Flows: browse activity plans, browse training plan templates, browse routes, search users, switch discovery type, open result detail.
- API/tRPC: `activityPlans.list`, `trainingPlans.listTemplates`, `routes.list`, `social.searchUsers`.
- System/local: debounced search, client-side type switching and filtering.

## Messaging And Notifications

- Screens: `apps/mobile/app/(internal)/(standard)/messages/index.tsx`, `apps/mobile/app/(internal)/(standard)/messages/[id].tsx`, `apps/mobile/app/(internal)/(standard)/notifications/index.tsx`.
- Flows: open inbox, open DM thread, send message, auto-mark thread read on open, fetch unread badges from headers, open notifications list, mark one or many notifications read, accept/reject follow requests inline, create DM from another user's profile.
- Notification routing and detail openings: `new_message` currently redirects to `/messages`; follow-request notifications stay actionable inline in the notifications list; no direct detail-route push is currently implemented for coaching, follower, imported-calendar, activity-update, FIT-file-update, or metric-update notifications.
- Current visible notification types: `new_message`, `follow_request`, `new_follower`, `coaching_invitation`; user-facing handling is richest for `new_message` and `follow_request`.
- API/tRPC: `messaging.getConversations`, `messaging.getMessages`, `messaging.sendMessage`, `messaging.markAsRead`, `messaging.getOrCreateDM`, `messaging.getUnreadCount`, `notifications.getRecent`, `notifications.markRead`, `notifications.getUnreadCount`, `social.acceptFollowRequest`, `social.rejectFollowRequest`.
- Backend creation points found: `social.followUser` creates `follow_request` for private profiles; `social.acceptFollowRequest` creates `new_follower`; FIT-processing has TODO-only admin/monitoring notifications and not a current user-facing notification path.
- System/local: thread polling every 5s, optimistic notification removal, badge refresh in shared headers.

## Profile, Account, And Settings

- Screens: `apps/mobile/app/(internal)/(standard)/user/[userId].tsx`, `apps/mobile/app/(internal)/(standard)/profile-edit.tsx`, `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`, `apps/mobile/app/(internal)/(standard)/followers.tsx`, `apps/mobile/app/(internal)/(standard)/following.tsx`, `apps/mobile/app/(internal)/(standard)/activity-efforts-list.tsx`, `apps/mobile/app/(internal)/(standard)/activity-effort-create.tsx`.
- Flows: view own/public profile, follow/unfollow user, create DM from profile, sign out, delete account, change email/password, edit profile fields, upload avatar, manage training preferences, manage manual activity efforts, update privacy and preferred units/language.
- API/tRPC: `profiles.getPublicById`, `profiles.update`, `auth.signOut`, `auth.deleteAccount`, `auth.updateEmail`, `auth.updatePassword`, `social.followUser`, `social.unfollowUser`, `social.getFollowers`, `social.getFollowing`, `messaging.getOrCreateDM`, `profileSettings.getForProfile`, `profileSettings.upsert`, `profileMetrics.getAtDate`, `analytics.predictPerformance`, `activityEfforts.getForProfile`, `activityEfforts.create`, `activityEfforts.delete`.
- System/local: image picker/camera flow, direct storage upload path for avatars, media/camera permissions, theme toggle.
- Related updates outside notifications: profile edits and avatar updates do not currently generate visible mobile notifications.

## Plan Tab And Goals

- Screens: `apps/mobile/app/(internal)/(tabs)/plan.tsx`, `apps/mobile/app/(internal)/(standard)/goal-detail.tsx`, `apps/mobile/app/(internal)/(standard)/training-plans-list.tsx`, `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx`.
- Flows: view active plan snapshot, inspect own plans, create goal, update goal, attach or edit milestone event, open plan detail/list.
- API/tRPC: `trainingPlans.getActivePlan`, `trainingPlans.list`, `trainingPlans.get`, `trainingPlans.getCurrentStatus`, `trainingPlans.getInsightTimeline`, `trainingPlans.getActualCurve`, `trainingPlans.getIdealCurve`, `trainingPlans.getWeeklySummary`, `goals.list`, `goals.create`, `goals.getById`, `goals.update`, `goals.delete`, `events.list`, `events.getById`, `events.create`, `events.update`, `events.delete`.
- System/local: chart projections, readiness/curve presentation, persistence of local plan UI state.

## Training Plans

- Screens: `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`, `apps/mobile/app/(internal)/(standard)/training-plan-edit.tsx`, `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx`, `apps/mobile/app/(internal)/(standard)/workouts-reorder.tsx`, `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx`, `apps/mobile/components/training-plan/QuickAdjustSheet.tsx`.
- Flows: create plan from guided config, edit plan metadata/structure, reorder workouts, duplicate plan, delete plan, update visibility, apply system template, quick adjust schedule/load, schedule activity-plan sessions into the calendar, update from creation config after preferences/goals change.
- API/tRPC: `trainingPlans.list`, `trainingPlans.get`, `trainingPlans.getTemplate`, `trainingPlans.getCreationSuggestions`, `trainingPlans.createFromCreationConfig`, `trainingPlans.updateFromCreationConfig`, `trainingPlans.update`, `trainingPlans.delete`, `trainingPlans.duplicate`, `trainingPlans.applyTemplate`, `trainingPlans.applyQuickAdjustment`, `activityPlans.list`, `activityPlans.getManyByIds`, `events.create`, `events.update`, `events.validateConstraints`, `social.toggleLike`.
- System/local: heavy local form state, previews before save, conflict handling, sheet interactions, local dismissal state.
- Schedule flexibility links: training plan editing combines with `training-preferences`, calendar rescheduling, recurring event scopes, and per-event move/edit/delete actions so plans can be adapted after creation.

## Calendar, Scheduling, And Events

- Screens: `apps/mobile/app/(internal)/(tabs)/calendar.tsx`, `apps/mobile/app/(internal)/(standard)/scheduled-activities-list.tsx`, `apps/mobile/app/(internal)/(standard)/event-detail.tsx`, `apps/mobile/components/ScheduleActivityModal.tsx`, `apps/mobile/components/training-plan/modals/AddActivityModal.tsx`.
- Flows: browse calendar windows, jump to today or another week, inspect daily/weekly scheduled items, create planned/rest/race/custom events, create on empty days or gaps, move event, edit event, delete event, reschedule from detail, validate schedule constraints, schedule an activity plan, remove a scheduled instance, start a planned workout from schedule context.
- Recurrence and flexibility: recurring events support `single` / `future` / `series` scopes for edit, move, delete, and reschedule; imported events are read-only; planned events can open plan detail or be started directly.
- API/tRPC: `events.list`, `events.getToday`, `events.getById`, `events.create`, `events.update`, `events.delete`, `events.validateConstraints`, `activityPlans.getById`, `activityPlans.list`.
- System/local: date/time pickers, recurrence handling, calendar viewport state, empty-gap affordances, selection-store handoff into recording.
- Imported/third-party schedule ingress: calendar supports read-only `imported` events and the backend includes iCal sync flows that land as imported calendar events rather than mobile notifications.

## Activity Plans

- Screens: `apps/mobile/app/(internal)/(standard)/create-activity-plan.tsx`, `apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx`, `apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx`, `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`, `apps/mobile/components/activity-plan/ActivityPlanComposerScreen.tsx`.
- Flows: create activity plan, edit plan structure, attach uploaded route, duplicate plan, delete plan, change privacy, like/comment on plan, schedule or unschedule plan, record now from plan context.
- API/tRPC: `activityPlans.list`, `activityPlans.getById`, `activityPlans.getManyByIds`, `activityPlans.getUserPlansCount`, `activityPlans.create`, `activityPlans.update`, `activityPlans.delete`, `activityPlans.duplicate`, `routes.upload`, `routes.get`, `events.getById`, `events.create`, `events.update`, `events.delete`, `events.validateConstraints`, `social.toggleLike`, `social.getComments`, `social.addComment`.
- System/local: bottom sheets, dirty-state handling, route preview, document picker, record-selection store.

## Activities And Recorded History

- Screens: `apps/mobile/app/(internal)/(standard)/activities-list.tsx`, `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`, `apps/mobile/app/(internal)/record/submit.tsx`.
- Flows: browse activity history, search activity records, open activity detail, fetch FIT streams, view charts/map, change privacy, delete activity, like/comment, submit a newly recorded activity, and consume dynamic derived TSS/IF summaries from router payloads rather than raw persisted activity stress columns.
- API/tRPC: `activities.list`, `activities.listPaginated`, `activities.search`, `activities.getById`, `activities.create`, `activities.update`, `activities.delete`, `fitFiles.getStreams`, `fitFiles.getSignedUploadUrl`, `fitFiles.processFitFile`, `profiles.getPublicById`, `social.toggleLike`, `social.getComments`, `social.addComment`.
- System/local: chart rendering, stream decompression, map reconstruction, finalized artifact cleanup after upload.

## Routes

- Screens: `apps/mobile/app/(internal)/(standard)/routes-list.tsx`, `apps/mobile/app/(internal)/(standard)/route-detail.tsx`, `apps/mobile/app/(internal)/(standard)/route-upload.tsx`, `apps/mobile/app/(internal)/record/route.tsx`, `apps/mobile/app/(internal)/record/route-preview.tsx`, `apps/mobile/components/Routes/RouteSelector.tsx`.
- Flows: browse routes, preview route detail, upload GPX route, delete route, like route, choose route during recording, attach route to activity plan.
- API/tRPC: `routes.list`, `routes.get`, `routes.upload`, `routes.delete`, `social.toggleLike`.
- System/local: map rendering, GPX file picking/parsing, local route attachment before save.

## Recording, Sensors, GPS, And FTMS

- Screens: `apps/mobile/app/(internal)/record/index.tsx`, `apps/mobile/app/(internal)/record/activity.tsx`, `apps/mobile/app/(internal)/record/plan.tsx`, `apps/mobile/app/(internal)/record/route.tsx`, `apps/mobile/app/(internal)/record/sensors.tsx`, `apps/mobile/app/(internal)/record/ftms.tsx`, `apps/mobile/app/(internal)/record/submit.tsx`.
- Start-path variants: direct tab launch defaults to run + GPS on; planned-start from calendar/event detail seeds `eventId` + activity plan into `activitySelectionStore`; record-from-plan uses attached activity plan payload; route-based start can attach/detach a route before recording; route preview confirms attach; setup locks once recording begins.
- Start configuration and overrides: before start the user can change activity category, GPS on/off, selected plan, selected route, connected metric sources, and trainer mode; during session the recorder can update derived metrics from `profiles.getZones`, adjust intensity scale, change preferred metric sources, switch trainer auto/manual, and preserve plan while updating category/GPS configuration.
- Device and trainer interactions: BLE permission gating, scan/stop scan, connect/disconnect sensors, reconnect disconnected sensors on foreground, reset all sensors, expose battery/control badges, FTMS machine-specific control UIs, auto/manual trainer control toggle, route-grade resistance when indoor + route + FTMS, ERG target reapplication when metrics change.
- Validation and start guards: `refreshAndCheckAllPermissions`, inline permission requests, `validatePlanRequirements`, continue-without-metrics flow, setup immutability after recording start, local finalization before submit.
- API/tRPC: `profiles.getZones`, `events.getToday`, `events.getById`, `activityPlans.getById`, `routes.list`, `routes.get`, `routes.loadFull`, `fitFiles.getSignedUploadUrl`, `fitFiles.processFitFile`.
- System/local: `ActivityRecorderService`, BLE scanning, FTMS control, GPS runtime and early map preview, route loading/progress, permission prompts, local artifact generation.
- Backend-light screens: `record-launcher`, `record/activity`, `record/sensors`, `record/ftms`.

## Integrations And Onboarding

- Screens: `apps/mobile/app/(internal)/(standard)/integrations.tsx`, `apps/mobile/app/(internal)/(standard)/onboarding.tsx`, `apps/mobile/app/(external)/onboarding.tsx`, `apps/mobile/app/(external)/callback.tsx`.
- Flows: complete smart onboarding profile/training setup, optionally connect provider during onboarding, list integrations, launch provider OAuth, disconnect provider, return from callback, import one completed historical FIT activity through the signed upload plus `fitFiles.processFitFile` flow, and ingest imported calendar events through backend integration sync.
- Onboarding database effects: internal onboarding `onboarding.completeOnboarding` updates `profiles` (`dob`, `gender`, `onboarded`), batches derived `profile_metrics`, and batches derived `activity_efforts`; it may warn and skip effort inserts if the environment requires `activity_id` but none exists. External onboarding is a lighter/legacy flow that updates `profiles` and creates a weight metric only.
- API/tRPC: `integrations.list`, `integrations.getAuthUrl`, `integrations.disconnect`, `fitFiles.getSignedUploadUrl`, `fitFiles.processFitFile`, `onboarding.completeOnboarding`, `profiles.get`, `profiles.update`, `profileMetrics.create`, `activityPlans.importFromFitTemplate`, `activityPlans.importFromZwoTemplate`.
- System/local: web browser auth session, deep-link callback parsing, redirect URI handling, optional HealthKit/bootstrap steps.
- Webhook/inbound audit note: user-facing mobile notifications for third-party inbound webhooks, activity imports, FIT-file processing status, or profile-metric updates were not found; current mobile surfacing is mainly integrations status plus read-only imported calendar events.

## Cross-Cutting Interaction Buckets

- Social actions reused across surfaces: `social.toggleLike`, `social.getComments`, `social.addComment`, `social.followUser`, `social.unfollowUser`.
- Scheduling actions reused across surfaces: `events.create`, `events.update`, `events.delete`, `events.validateConstraints`, `events.getToday`.
- File/media flows reused across surfaces: route GPX upload, avatar image selection/upload, FIT file upload + processing.
- Device/system flows reused across surfaces: BLE, FTMS, GPS, deep links, web auth browser, camera/media permissions, notifications badges.
- Calendar flexibility controls reused across surfaces: schedule modal, event detail reschedule, recurring-scope updates, training-preferences schedule limits, quick adjust, reorder, and direct plan-to-calendar scheduling.

## Audit Notes

- Messaging coverage is present and now explicitly includes inbox, thread read state, DM creation from profile, header badges, and the only current notification redirect path (`new_message` -> `/messages`).
- Notification-detail routing is limited today; there is no broad notification-to-detail router for activities, plans, imported events, FIT processing, profile metrics, or webhook-originated provider changes.
- Recording coverage now explicitly includes start-from-route, start-from-activity-plan, start-from-scheduled-event, trainer controls, BLE connection management, setup locks, metric/intensity overrides, and initial configuration updates.
- Onboarding coverage now names the exact record-creation/update footprint across `profiles`, `profile_metrics`, and `activity_efforts`.
- Flexible scheduling coverage is present across `training-preferences`, training-plan editing, calendar create/edit/move/delete, recurring scope handling, and rescheduling from event detail.

## Backend-Light But Test-Worthy Screens

- UI or deep-link heavy: `apps/mobile/app/(external)/auth-error.tsx`, `apps/mobile/app/(external)/sign-up-success.tsx`, `apps/mobile/app/(external)/verification-success.tsx`, `apps/mobile/app/(external)/callback.tsx`.
- Device-heavy: `apps/mobile/app/(internal)/record/sensors.tsx`, `apps/mobile/app/(internal)/record/ftms.tsx`, `apps/mobile/app/(internal)/record/activity.tsx`.
- Navigation-only or placeholder surfaces: `apps/mobile/app/(internal)/(tabs)/record-launcher.tsx`, legacy create/edit redirect routes, preview/demo screens.

## Suggested Testing Use

- Use each section as a checklist seed for Jest screen coverage, Maestro flow coverage, and router-level mutation/query coverage.
- Prioritize cross-surface flows first: auth, notifications/messages, plan-to-calendar scheduling, plan-to-record handoff, record-to-submit, and social interactions on detail screens.
- Revisit this inventory whenever a new route or mobile-used tRPC procedure is added.
