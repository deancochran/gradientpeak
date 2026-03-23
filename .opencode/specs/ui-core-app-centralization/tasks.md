# Tasks

## Completed

- Added a web `Switch` in `@repo/ui` and adopted it from `apps/web/src/app/(internal)/settings/page.tsx`.
- Extracted goal draft helpers from `apps/mobile/lib/goals/goalDraft.ts` into `packages/core/goals/draft.ts` and left the mobile file as a compatibility re-export.
- Extracted parsing helpers from `apps/mobile/lib/training-plan-form/input-parsers.ts` into `packages/core/forms/input-parsers.ts` and reused them from `packages/core/plan/trainingPlanPreview.ts`.
- Extracted training-plan validation/adapters from `apps/mobile/lib/training-plan-form/validation.ts` into `packages/core/plan/formValidation.ts` and left the mobile file as a compatibility re-export.
- Replaced the local schema in `apps/web/src/app/(internal)/settings/page.tsx` with a shared profile update contract derived from `profileQuickUpdateSchema`.
- Added shared notification adapters in `packages/core/notifications/index.ts` and adopted them from `apps/web/src/app/(internal)/notifications/page.tsx`, `apps/web/src/components/notifications-button.tsx`, and `apps/mobile/app/(internal)/(standard)/notifications/index.tsx`.
- Added package-level tests for the new core helpers and the new web `Switch`.
- Added stable `@repo/core` subpath exports for `contracts`, `schemas`, `profile`, `messaging`, and `coaching`, then introduced shared profile/messaging/coaching adapter modules with package-level tests.
- Re-homed mobile quick-adjustment and recording plan validation logic into `packages/core/plan`, leaving the old mobile files as compatibility exports while new consumers import the shared core modules.
- Normalized tRPC messaging and coaching outputs through shared core adapters and adopted the new conversation/roster contracts in the web and mobile message/coaching screens.
- Centralized mobile consumers on `@repo/ui` for parsed inputs and shared shell components, adopted shared `Alert`/`ToggleGroup` primitives in key mobile flows, and removed the app-local proxy wrappers those consumers previously depended on.
- Expanded mobile adoption of existing `@repo/ui` components by replacing more hand-rolled empty/error/auth/progress/comment-input states with shared `EmptyStateCard`, `ErrorStateCard`, `Alert`, `Progress`, and `Textarea` components.
- Continued the mobile centralization pass by replacing additional warning/divider/progress layouts with shared `Alert`, `Separator`, and `Progress` primitives and by adopting `RadioGroup` for training-plan schedule anchor selection.
- Migrated `GoalEditorModal` choice-group UI to shared `RadioGroup` and `ToggleGroup` primitives so mobile goal editing now relies more directly on `@repo/ui` selection controls.
- Added a separate Jest + `@testing-library/react-native` path for `apps/mobile` so native component/screen test migration can proceed without disturbing the existing Vitest suite.
- Fixed the broken `packages/core` root namespace export for `Estimators` by targeting the concrete `packages/core/estimators/index.ts` barrel.
- Added an app-local `apps/mobile/test/render-native.tsx` helper and migrated the first two mobile tests away from direct `react-test-renderer` usage to Jest + `@testing-library/react-native` (`training-plans-list-screen` and `CalendarPlannedActivityPickerModal`).
- Continued the mobile test migration by moving `ScheduleActivityModal` and `user-detail-screen` onto the Jest + `@testing-library/react-native` path and adding `test:jest:file`/`test:jest:watch` scripts for batch conversion work.
- Continued the low-risk test migration pass by moving `create-activity-plan-route`, `user-layout-routes`, and `plan-standard-routes` onto the mobile Jest + `@testing-library/react-native` path while leaving the more complex deep-link scheduling suites on Vitest for now.
- Continued the low-risk mobile Jest migration with `plan-navigation`, `training-plan-layout-routes`, and the still-skipped `avatar-navigation` suite, reducing the remaining direct `react-test-renderer` authored test files again while keeping the full Jest suite green.
- Continued the Jest migration with `activity-plan-layout-routes`, `goal-detail-persistence`, and `plan-goal-persistence`, using mocked `@repo/core` payload builders where needed to keep the migrated suites focused on screen behavior and mutation wiring.
- Converted `scheduled-activities-list` to the Jest + `@testing-library/react-native` path, but left `training-preferences-preview` and `event-detail-delete-redirect` on Vitest after hitting the same deeper runtime/state-coupling issues seen in earlier complex migrations so the Jest suite stays green while simpler suites continue to move over.
- Converted isolated chart and hook tests (`PlanVsActualChart`, `CreationProjectionChart.metadata`, and `useDeletedDetailRedirect`) to the Jest + `@testing-library/react-native` path and expanded the shared native Jest mock surface with window/color helpers so those isolated suites can stay off direct `react-test-renderer` usage too.
- Converted `useTrainingPlanSnapshot`, `useActivityPlanForm`, and `SinglePageForm.blockers` to the Jest + `@testing-library/react-native` path; `training-preferences-preview` and the deep-link/event-detail screen tests remain on Vitest for now because they still have heavier state/runtime coupling than the already-converted isolated suites.
- Attempted `calendar-screen` on the Jest path, but reverted it to the stable Vitest version after hitting a broader render-surface mismatch in the screen-level mock graph; the Jest suite remains green while the remaining renderer-authored files are concentrated in the harder screen/form cases.
- Converted `training-preferences-preview`, `event-detail-delete-redirect`, `SinglePageForm.blockers`, and `activity-plan-detail-scheduling` onto the mobile Jest + `@testing-library/react-native` path; only `calendar-screen` still remains on direct `react-test-renderer` authoring because the shared Jest `react-native` mock currently lacks a safe `SectionList` render path for that screen.
- Added shared `SectionList` support to the native Jest mock layer and finished migrating `calendar-screen`, bringing mobile to zero direct authored `react-test-renderer` test files while keeping the full mobile Jest suite green.
- Fixed the root `Estimators` namespace export in `packages/core/index.ts` to target the concrete estimators barrel, preserving the intended migration path to `@repo/core/estimators`.
- Removed remaining mobile wrapper re-exports for shared goal draft, training-plan validation, date input, and weight input modules, then added repo-level ownership guardrails so those thin proxies do not return.
- Migrated `training-preferences-preview` from direct Vitest/`react-test-renderer` authoring onto the mobile Jest + `@testing-library/react-native` path, keeping the full mobile Jest suite green so one of the last preview-focused renderer tests no longer blocks the migration.
- Migrated `event-detail-delete-redirect` from direct Vitest/`react-test-renderer` authoring onto the mobile Jest + `@testing-library/react-native` path, mocking the schedule refresh dependency to keep the suite focused on redirect/query behavior while the full mobile Jest suite stays green.
- Migrated `training-plan-deeplink` from direct Vitest/`react-test-renderer` authoring onto the mobile Jest + `@testing-library/react-native` path, preserving the deep-link routing and scheduling assertions while the full mobile Jest suite stays green.
- Migrated `activity-plan-detail-scheduling` from direct Vitest/`react-test-renderer` authoring onto the mobile Jest + `@testing-library/react-native` path, preserving the schedule/duplicate alert flows and keeping the full mobile Jest suite green.

## Open

- Finish the remaining `@repo/core` boundary cleanup around Supabase-derived schema exports such as `RecordingServiceActivityPlan`, profile metric schemas, and activity-effort schemas.
- Promote reusable parsed field components from mobile into `packages/ui`.
- Promote generic shell components that are shared by both apps into `packages/ui`.
- Continue re-homing app-owned tests so package-level behavior lives primarily in `packages/core` and `packages/ui`.

## Next UI Centralization Chore

- Treat this as a launch-first backlog, not a must-finish bundle. Complete Tier 1, then reassess before starting Tier 2 or Tier 3.

### Tier 1

- [ ] Extract a web `AuthPageShell` / `AuthCardFrame` from `apps/web/src/app/(external)/auth/login/page.tsx`, `apps/web/src/app/(external)/auth/sign-up/page.tsx`, `apps/web/src/app/(external)/auth/forgot-password/page.tsx`, and `apps/web/src/app/(external)/auth/update-password/page.tsx`.
- [ ] Refactor `apps/web/src/components/login-form.tsx`, `apps/web/src/components/sign-up-form.tsx`, `apps/web/src/components/forgot-password-form.tsx`, and `apps/web/src/components/update-password-form.tsx` onto the shared `@repo/ui/components/form` composition layer where the layout is reusable.
- [ ] Introduce a native `PageSheetModal` shell in `packages/ui` and adopt it in `apps/mobile/components/ScheduleActivityModal.tsx` and `apps/mobile/components/calendar/CalendarPlannedActivityPickerModal.tsx`.
- [ ] Introduce a shared segmented-control wrapper above `ToggleGroup` and adopt it in `apps/mobile/components/TimeRangeSelector.tsx` and `apps/mobile/components/calendar/CalendarViewSegmentedControl.tsx`.

### Tier 2

- [ ] Extract a web `IconBadgeButton`-style trigger from `apps/web/src/components/notifications-button.tsx` and `apps/web/src/components/messages-button.tsx`.
- [ ] Move the generic TanStack wrapper in `apps/web/src/components/ui/data-table.tsx` into a web-owned `packages/ui` surface.
- [ ] Evaluate a package-owned web `AppHeader` / `AccountMenu` shell from `apps/web/src/components/nav-bar.tsx`, `apps/web/src/components/user-nav.tsx`, and `apps/web/src/components/dashboard-header.tsx`.

Start Tier 2 only if the active launch backlog still has repeated web toolbar or table work that will benefit immediately.

### Tier 3

- [ ] Expand `packages/ui/src/components/metric-card/` so compact stat-card use cases like `apps/mobile/components/home/StatCard.tsx` no longer need a parallel local generic component.
- [ ] Expand `packages/ui/src/components/empty-state-card/` and `packages/ui/src/components/error-state-card/` so app-local generic presentation like `apps/mobile/components/home/EmptyState.tsx` and the fallback views in `apps/mobile/components/ErrorBoundary.tsx` can share more of the UI surface without moving navigation/error-boundary logic.

Defer Tier 3 if launch timing is tight; these are polish improvements, not blockers.

### Validation And Ownership

- [ ] Add or extend package-owned stories, fixtures, and tests for each new `packages/ui` composite.
- [ ] Remove or slim app tests that currently validate package-owned presentation once those assertions live in `packages/ui`.
- [ ] Keep app-level tests focused on data wiring, navigation, and mutation flow after the UI moves.
