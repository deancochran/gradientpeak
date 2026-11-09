# Web and Mobile Functional Parity

This matrix is the acceptance index for browser functionality that corresponds to the mobile app. A capability is considered verified only when the web route exists and the cited Playwright journey executes the user-visible behavior. Component and unit tests are supporting evidence, not browser proof.

## Capability matrix

| Capability | Mobile surface | Web surface | Playwright evidence | Status |
| --- | --- | --- | --- | --- |
| Authentication, verification, and recovery | `apps/mobile/app/(external)/` | `apps/web/src/routes/auth/` | `auth.spec.ts`, `auth-variations.spec.ts`, `capability-p0-auth-recovery.spec.ts` | Covered |
| Onboarding and provider selection | `apps/mobile/app/(internal)/(standard)/onboarding.tsx` | `apps/web/src/routes/onboarding.tsx` | `onboarding.spec.ts`, `onboarding-social-variations.spec.ts`, `capability-p3-onboarding.spec.ts` | Covered |
| Profile, privacy, account, and security | `profile-edit.tsx`, `components/profile/MeScreen.tsx` | `apps/web/src/routes/_protected/settings.tsx` | `profiles-social.spec.ts`, `profiles-social-variations.spec.ts`, `capability-p3-settings-coaching.spec.ts` | Covered, including DOB, planning timezone, analytics consent, password, sessions, and visibility |
| Activity history, import, and detail | `activities-list.tsx`, `activity-import.tsx`, `activity-detail.tsx` | `apps/web/src/routes/_protected/activities/` | `activities.spec.ts`, `activities-variations.spec.ts` | Covered |
| Recording lifecycle | `apps/mobile/app/(internal)/record/` | `apps/web/src/routes/_protected/record/` | `recording.spec.ts`, `recording-variations.spec.ts`, `capability-p0-record-lifecycle.spec.ts` | Browser alternative covered; Web Bluetooth sensors and eligible FTMS trainer control are feature-detected foreground enhancements; see platform exceptions |
| Route library, upload, edit, detail, and attach | `routes-list.tsx`, `route-upload.tsx`, `route-edit.tsx`, `route-detail.tsx` | `apps/web/src/routes/_protected/routes/`, `_protected/record/route/` | `routes.spec.ts`, `route-variations.spec.ts`, `capability-p1-routes.spec.ts`, `capability-p0-route-gaps.spec.ts` | Covered |
| Calendar and planning | `(tabs)/calendar.tsx`, `(tabs)/plan.tsx`, `calendar-day.tsx`, `agenda-create.tsx`, `planning-ledger.tsx` | `apps/web/src/routes/_protected/calendar/`, `_protected/plan.tsx` | `calendar-events.spec.ts`, `calendar-planning-variations.spec.ts`, `planning.spec.ts`, `planning-variations.spec.ts` | Covered |
| Goals | `goals-list.tsx`, `goal-create.tsx`, `goal-detail.tsx`, `goal-edit.tsx` | `apps/web/src/routes/_protected/goals/` | `goals.spec.ts`, `goals-variations.spec.ts`, `capability-p1-goals.spec.ts` | Covered |
| Activity plans | `activity-plans-list.tsx`, `create-activity-plan.tsx`, `activity-plan-detail.tsx` | `apps/web/src/routes/_protected/activity-plans/` | `activity-plans.spec.ts`, `plans-variations.spec.ts` | Covered |
| Training plans and preferences | `training-plans-list.tsx`, `training-plan-create.tsx`, `training-plan-detail.tsx`, `training-plan-edit.tsx`, `training-preferences.tsx` | `apps/web/src/routes/_protected/training-plans/`, `_protected/training-preferences.tsx` | `training-plans.spec.ts`, `plans-variations.spec.ts` | Covered |
| Groups, membership, and events | `(tabs)/groups.tsx`, `my-groups.tsx`, `group-*` | `apps/web/src/routes/_protected/groups/` | `groups-events.spec.ts`, `groups-variations.spec.ts`, `onboarding-social-variations.spec.ts` | Covered |
| Messages | `inbox.tsx`, `messages/` | `apps/web/src/routes/_protected/messages.tsx` | `messaging-notifications.spec.ts`, `messaging-variations.spec.ts`, `shell-screen-variations.spec.ts` | Covered |
| In-app notifications | `notifications/index.tsx`, `inbox.tsx` | `apps/web/src/routes/_protected/notifications.tsx` | `messaging-notifications.spec.ts`, `discovery-notification-variations.spec.ts`, `capability-p1-notifications.spec.ts` | Covered |
| Search, discovery, and feed | `(tabs)/discover.tsx`, `search.tsx`, `components/discover/`, `components/feed/` | `_protected/search.tsx`, `components/discover/`, `components/feed/` | `feed-discovery.spec.ts`, `feed-discovery-variations.spec.ts`, `discovery-notification-variations.spec.ts` | Covered |
| Provider integrations | `integrations.tsx`, `lib/integration-provider-actions.ts` | `_protected/integrations.tsx`, `routes/api/integrations/` | `integrations.spec.ts`, `integration-variations.spec.ts` | Covered in the dedicated canonical-provider project |
| Coaching organizations | No mobile screen | `apps/web/src/routes/_coaching/organizations/` | `capability-p3-settings-coaching.spec.ts`, `shell-screen-variations.spec.ts` | Web-only; authorized and revoked-role shells covered, workspace data remains intentionally gated |
| Anonymous sharing | Mobile produces web share URLs | `apps/web/src/routes/share/` | `capability-p0-public-share.spec.ts`, `activities.spec.ts`, `activities-variations.spec.ts` | Covered for activities, activity plans, training plans, and routes, including private/revoked denial |

## Intentional platform exceptions

| Native capability | Browser behavior | Rationale and expected experience |
| --- | --- | --- |
| BLE and FTMS sensor control | Feature-detected, user-initiated Web Bluetooth connection to supported FTMS, heart-rate, and cycling-power hardware while the recorder tab is visible | Web Bluetooth availability and hardware capabilities vary by browser and device. The web recorder never scans or reconnects in the background, disconnects sensors when hidden, and only exposes trainer commands after a writable FTMS control point is explicitly enabled. |
| Background GPS recording | Not offered by the web recorder | Browser background execution cannot provide the native lifecycle guarantees required for durable GPS capture. Users must use the mobile recorder; web route upload and route browsing remain available. |
| Native recording notification | No browser equivalent | Mobile uses an OS notification to support an active native recording lifecycle. Web recording must remain visible in the foreground and communicates that limitation before starting. |
| Camera-native capture | Browser file selection/upload | Web profile and route workflows use browser file inputs rather than requiring a native camera API. |
| Public-reader deep links | Rendered by the web app | Mobile creates share URLs; anonymous recipients receive the privacy-filtered browser reader instead of an authenticated mobile screen. |

## Required Playwright projects

- `Desktop Chrome`
- `Desktop Firefox`
- `Narrow Firefox` at 390 by 844
- `Mobile Chrome 390x844`
- `Canonical Provider State` for provider-dependent integration journeys only

The first four projects must execute without unexpected skips. Provider-dependent journeys belong only to the explicit seeded provider project. Required infrastructure must fail before test execution when the dedicated E2E database, browser runtime, or seeded provider state is unavailable.

## Current verification limitation

Normal Playwright startup is blocked until `20260904190452_add_lthr_threshold_calibration.sql` can migrate a retained E2E database safely. The migration currently attempts to drop `accounts_pkey` as an index even though PostgreSQL owns it through a primary-key constraint. Browser runs may reuse the isolated E2E stack for investigation, but the complete acceptance gate remains unverified until normal database startup and migration succeed.
