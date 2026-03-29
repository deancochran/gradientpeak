# Mobile E2E Coverage Expansion

## Objective

Define a durable mobile end-to-end coverage model for the Expo dev-client Maestro workflow so every important screen, navigation path, and user interaction has an intentional place in the suite.

## Scope

- Mobile app screen inventory under `apps/mobile/app/`.
- Maestro flow inventory and target flow structure under `apps/mobile/.maestro/flows/`.
- App-side testability contracts, primarily stable `testID` and accessibility anchors.
- Coverage planning only; implementation comes after this spec is approved.

## Non-Goals

- Reworking the current local dev-client orchestration.
- Expanding into CI sharding or matrix orchestration right now.
- Writing or modifying Maestro flows in this spec phase.
- Adding broad cosmetic `testID`s to every component without a coverage purpose.

## Constraints

- Reuse the current reliable foundation: Expo dev-client setup, conditional login, authenticated home reset, and stable tab-button selectors.
- Prefer a small number of stable, semantic test anchors over copy-based selectors.
- Add app-side anchors only where they materially improve Maestro reliability or observability.
- Keep flows organized around user journeys and screen entry points, not around implementation details.
- Keep `@repo/core` and non-mobile packages out of scope unless a mobile flow absolutely depends on them.

## Current Foundation

- Reusable boot/login/reset helpers already exist in `apps/mobile/.maestro/flows/reusable/`.
- Stable bottom-tab selectors already exist in `apps/mobile/app/(internal)/(tabs)/_layout.tsx`.
- Calendar and several standard-stack detail screens already expose meaningful test anchors.
- Existing flow coverage already touches auth, onboarding, tabs, discover profile entry, messaging, notifications, calendar event work, record quick start, and plan scheduling journeys.

## Coverage Model

### Tier 1: Runtime Gate

These flows prove the app is launchable and usable at all.

- unauthenticated auth entry
- sign in
- onboarding path or verified-user bypass
- authenticated home reset
- tab navigation smoke

### Tier 2: Screen Entry Coverage

Each major user-facing screen should have at least one deterministic entry flow that proves:

- the screen opens,
- its primary content becomes visible,
- a stable readiness anchor exists.

This is the minimum bar for broad app coverage.

### Tier 3: Primary Interaction Coverage

Critical screens should additionally prove their primary action works end-to-end, such as:

- create,
- edit,
- delete,
- schedule,
- duplicate,
- send,
- sign out,
- start recording.

### Tier 4: State And Resilience Coverage

Selected screens should also cover:

- empty state,
- loading readiness,
- invalid input,
- warm relaunch,
- retry or recoverable error states where practical.

## Proposed Flow Topology

- `apps/mobile/.maestro/flows/reusable/`
  - Expo boot helpers
  - login/session helpers
  - reset/navigation helpers
  - shared openers for common destinations
- `apps/mobile/.maestro/flows/main/`
  - runtime gate and suite entry smoke flows
- `apps/mobile/.maestro/flows/journeys/auth/`
  - auth and onboarding journeys
- `apps/mobile/.maestro/flows/journeys/discover/`
  - discover browse and detail-open journeys
- `apps/mobile/.maestro/flows/journeys/calendar/`
  - calendar event and scheduling journeys
- `apps/mobile/.maestro/flows/journeys/plans/`
  - training/activity plan and goal journeys
- `apps/mobile/.maestro/flows/journeys/profile/`
  - profile, settings, and account journeys
- `apps/mobile/.maestro/flows/journeys/messages/`
  - inbox, thread, and send journeys
- `apps/mobile/.maestro/flows/journeys/notifications/`
  - inbox and action journeys
- `apps/mobile/.maestro/flows/journeys/record/`
  - activity selection, plan attach, start, and submit journeys
- `apps/mobile/.maestro/flows/journeys/routes/`
  - route list/detail entry journeys
- `apps/mobile/.maestro/flows/journeys/activities/`
  - activity list/detail entry journeys

## Screen Inventory And Coverage Intent

### External Auth Screens

- `apps/mobile/app/(external)/index.tsx`: welcome/auth choice
- `apps/mobile/app/(external)/sign-in.tsx`: sign in form
- `apps/mobile/app/(external)/sign-up.tsx`: sign up form
- `apps/mobile/app/(external)/forgot-password.tsx`: reset email request
- `apps/mobile/app/(external)/verify.tsx`: email verification waiting state
- `apps/mobile/app/(external)/sign-up-success.tsx`: post-signup confirmation
- `apps/mobile/app/(external)/verification-success.tsx`: verified confirmation
- `apps/mobile/app/(external)/auth-error.tsx`: auth failure state
- `apps/mobile/app/(external)/callback.tsx`: auth callback transition

Coverage intent:

- keep entry/auth flows deterministic,
- preserve forgot-password and verification coverage,
- avoid over-testing callback internals unless needed for a real regression.

### Tab Screens

- `apps/mobile/app/(internal)/(tabs)/index.tsx`: home/feed
- `apps/mobile/app/(internal)/(tabs)/discover.tsx`: discover browse and search
- `apps/mobile/app/(internal)/(tabs)/plan.tsx`: plan dashboard and goal entry points
- `apps/mobile/app/(internal)/(tabs)/calendar.tsx`: schedule/calendar workspace
- `apps/mobile/app/(internal)/record/index.tsx` via tab launcher: record runtime entry

Coverage intent:

- every tab must have entry coverage,
- tabs with mutations or deeper navigation need dedicated journeys.

### Standard Internal Screens

- onboarding
- user detail/profile
- followers/following
- messages inbox and thread
- notifications inbox
- activities list and activity detail
- routes list and route detail/upload
- activity effort list/create
- activity plan detail/create builder screens
- scheduled activities list
- event detail
- goal detail
- training plans list/detail/create/edit/reorder
- profile edit
- integrations
- training preferences

Coverage intent:

- every major destination gets at least a screen-entry check,
- detail/mutation screens get primary CTA coverage where business value is high.

### Record Stack Screens

- `apps/mobile/app/(internal)/record/activity.tsx`
- `apps/mobile/app/(internal)/record/sensors.tsx`
- `apps/mobile/app/(internal)/record/plan.tsx`
- `apps/mobile/app/(internal)/record/ftms.tsx`
- `apps/mobile/app/(internal)/record/submit.tsx`

Coverage intent:

- verify record setup and start path first,
- add sub-screen coverage where the app already exposes enough stable state.

## Test Anchor Strategy

### Preferred Anchor Types

- root screen readiness ids such as `discover-screen`
- deterministic CTA ids such as `profile-sign-out-button`
- deterministic row ids based on stable entity identifiers such as `messages-conversation-<id>`
- modal/dialog readiness ids for transient UI
- accessibility labels only when a component type is hard to target otherwise

### Anchor Rules

- Every major screen should expose one root readiness anchor.
- Every major journey should expose anchors for its primary action and completion state.
- Repeated list items should use stable entity-based ids where the data model provides an id.
- Avoid relying on visible text when the screen already has a stable semantic anchor.
- Do not add duplicate anchors for the same purpose unless Maestro needs both container and CTA visibility.

## Missing Test ID Inventory

### High Priority Missing Anchors

These screens are central to the next coverage wave and currently lack sufficient stable anchors.

- `apps/mobile/app/(internal)/(tabs)/index.tsx`
  - missing root readiness anchor such as `home-screen`
  - optional feed readiness anchor if the feed can be slow or empty
- `apps/mobile/app/(internal)/(tabs)/discover.tsx`
  - missing root readiness anchor such as `discover-screen`
  - missing search input anchor
  - missing discover-type tab anchors for activity plans, training plans, routes, and users
  - missing category filter anchors
  - missing result-list anchors by active section
  - missing stable item-row anchors for training plans, routes, and user cards
- `apps/mobile/app/(internal)/(tabs)/plan.tsx`
  - missing root readiness anchor such as `plan-screen`
  - missing `add goal` button anchor
  - missing current-plan navigation button anchors
- `apps/mobile/app/(internal)/record/index.tsx`
  - missing root readiness anchor such as `record-screen`
  - missing selected-activity summary anchor
  - missing start/pause/resume/finish action anchors if not already provided inside child components
  - missing permission-warning or setup-locked readiness anchors if those states matter in E2E
- `apps/mobile/app/(internal)/record/activity.tsx`
  - missing root readiness anchor such as `record-activity-screen`
  - missing category option anchors
  - missing save action anchor
- `apps/mobile/app/(internal)/record/plan.tsx`
  - missing root readiness anchor such as `record-plan-screen`
  - missing search input anchor
  - missing category filter anchors
  - missing detach action anchor
  - missing plan row anchors keyed by event id

### Medium Priority Missing Anchors

- `apps/mobile/app/(internal)/(standard)/training-plans-list.tsx`
  - likely needs root readiness plus stable row/CTA anchors for list coverage
- `apps/mobile/app/(internal)/(standard)/activities-list.tsx`
  - likely needs root readiness plus row anchors
- `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
  - likely needs root readiness and one or two primary CTA anchors
- `apps/mobile/app/(internal)/(standard)/routes-list.tsx`
  - likely needs root readiness plus row anchors
- `apps/mobile/app/(internal)/(standard)/route-detail.tsx`
  - has delete anchor but likely needs root readiness and primary open state anchor
- `apps/mobile/app/(internal)/(standard)/profile-edit.tsx`
  - likely needs root readiness and save anchor
- `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`
  - should add root readiness and primary save/apply anchors if a Maestro journey will change settings
- `apps/mobile/app/(internal)/(standard)/integrations.tsx`
  - should add root readiness even though it already has a back button anchor

### Lower Priority Or Deferred Anchors

- callback-style transition screens that are mainly routing intermediates
- storybook and UI preview surfaces unless they remain part of runtime smoke
- specialized record sub-screens like sensors or ftms until we intentionally add those journeys

## Coverage Sequencing Recommendation

1. Add missing high-priority anchors for Home, Discover, Plan, and Record.
2. Add screen-entry flows for every tab and major standard-stack destination.
3. Expand into critical interaction journeys for calendar, plans, profile, messages, and notifications.
4. Fill remaining list/detail screens once the core user journeys are stable.

## Success Criteria

- Every major mobile screen has a named coverage target in this spec.
- Missing test anchors are identified before implementation starts.
- The next implementation pass can add anchors and flows without rediscovering the app structure.
