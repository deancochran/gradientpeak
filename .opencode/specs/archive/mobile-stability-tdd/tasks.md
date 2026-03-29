# Tasks

## Coordination Notes

- Keep Maestro focused on true user journeys, not branch permutations.
- Keep Jest focused on capability, validation, and regression behavior.
- Use real shared inputs in the onboarding regression suite unless a native boundary must be mocked.

## Open

### Phase 1 - Onboarding And Auth Stability

- [x] Add failing Jest tests for onboarding required-vs-optional step behavior.
- [x] Add failing Jest tests for manual values not being overwritten by estimate actions or rerenders.
- [x] Add focused Jest tests for sign-up and verify validation or error behavior.
- [x] Fix onboarding skip and validation behavior.
- [x] Fix any onboarding/auth regressions uncovered by the new tests.
- [x] Run targeted mobile validation for the onboarding/auth slice.

### Phase 2 - Calendar Stability

- [x] Add failing Jest tests for passive scroll churn, explicit selection preservation, and infinite extension behavior.
- [x] Fix calendar scroll-state flicker and duplicate snap behavior.
- [x] Run targeted mobile validation for the calendar slice.

### Phase 3 - Discover Redesign

- [ ] Define the simplified mobile-first Discover behavior in tests.
- [ ] Implement the Discover redesign.
- [ ] Add or update the matching Maestro browse journey.

### Phase 4 - Maestro Journey Expansion

- [x] Document a fixture matrix and scalable Maestro folder architecture.
- [x] Add a shared authenticated-session reusable flow.
- [x] Add stable `testID`s for mutation-heavy training-plan, activity-plan, event-detail, and training-plan composer surfaces.
- [x] Add a Maestro onboarding skip-path journey.
- [x] Update the discover profile flow to current selectors and add a domain journey version.
- [x] Add training-plan duplicate/schedule/open-calendar Maestro journeys.
- [x] Add activity-plan duplicate/schedule/remove Maestro journeys.
- [x] Add event create/edit/delete and plan-side-effect Maestro journeys.
- [x] Harden the Expo dev-client bootstrap path so auth navigation can reliably enter the app from Maestro.
- [x] Standardize fixture env naming and add a checked-in fixture env template.
- [x] Re-run the runtime sign-up-to-verify Maestro flow now that local Supabase auth confirmations match the intended verify-first workflow.

## Pending Validation

- [ ] Run focused Jest suites after each slice.
- [ ] Run the narrowest relevant typecheck before handoff.

## Completed Summary

- Spec created to stabilize the mobile app with a TDD split: Maestro for high-value journeys and Jest for screen and component capability.
- Strengthened the first onboarding stability slice with a real-input Jest regression in `apps/mobile/app/(internal)/(standard)/__tests__/onboarding.jest.test.tsx` so optional steps must remain skippable.
- Added a shared native input regression in `packages/ui/src/components/bounded-number-input/index.native.test.tsx` and updated `packages/ui/src/components/bounded-number-input/index.native.tsx` so partial numeric typing stays user-controlled until blur commit.
- Updated `apps/mobile/app/(internal)/(standard)/onboarding.tsx` to drive skip availability from explicit per-step metadata instead of the old inverted validity rule.
- Added a calendar regression in `apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx` that proves passive scroll callbacks should not trigger header churn before the scroll settles.
- Updated `apps/mobile/app/(internal)/(tabs)/calendar.tsx` so passive viewport tracking now stays in refs during scroll instead of writing visible-date state on every `onViewableItemsChanged` callback.
- Added focused auth screen Jest coverage in `apps/mobile/app/(external)/__tests__/sign-up.jest.test.tsx` and `apps/mobile/app/(external)/__tests__/verify.jest.test.tsx` for sign-up success, duplicate-email mapping, verify resend confirmation, and verified-user redirect behavior.
- Improved the shared native test harness in `packages/ui/src/test/react-native.tsx` by adding a `KeyboardAvoidingView` host so external auth screens can render under Jest without ad hoc per-file runtime patching.
- Expanded Maestro standardization in `apps/mobile/.maestro/README.md`, `apps/mobile/.maestro/FIXTURES.md`, and new reusable flows so domain journeys share one authenticated bootstrap path and documented fixture expectations.
- Added mutation-oriented Maestro journeys for onboarding skip, discover profile open, training-plan duplicate/schedule sync, activity-plan duplicate/schedule/remove, and custom event create/edit/delete in `apps/mobile/.maestro/flows/journeys/`.
- Added stable `testID`s across `apps/mobile/app/(internal)/(tabs)/plan.tsx`, `apps/mobile/components/ScheduleActivityModal.tsx`, `apps/mobile/app/(internal)/(standard)/route-detail.tsx`, `apps/mobile/app/(internal)/(standard)/goal-detail.tsx`, and `apps/mobile/app/(internal)/(standard)/user/[userId].tsx` so broader Maestro coverage can scale beyond copy-based selectors.
- Hardened `apps/mobile/.maestro/flows/reusable/bootstrap.yaml` so `auth_navigation.yaml` now reliably enters the app from the Expo dev client instead of getting stranded on the launcher or Android home screen.
- Added standardized fixture env documentation in `apps/mobile/.maestro/fixtures.env.example` and aligned auth and authenticated-session flows around canonical env names.
- Added a deeper auth-guard regression in `apps/mobile/app/__tests__/root-layout.jest.test.tsx` proving signed-in unverified users on the sign-up route must redirect to verify.
- Maestro now exposes a real runtime app bug: `sign_up_to_verify.yaml` reaches successful sign-up but still does not surface `verify-screen`, so the sign-up-to-verify transition remains blocked on app-side investigation.
- Identified the local runtime mismatch: `packages/supabase/config.toml` had email confirmations disabled, which bypassed the intended verify screen after sign-up. Local auth is now configured for verify-first behavior again.
- Fixed the follow-on verify-screen render crash in `apps/mobile/app/(external)/verify.tsx` by removing the custom native input `className` that was triggering `path.split is not a function` in the dev client. After the fix, both `auth_navigation.yaml` and the reusable sign-up-to-verify Maestro flow pass against the restarted local stack.
- Added `apps/mobile/scripts/run-maestro-flows.mts` plus `apps/mobile/package.json` script updates so repo-driven Maestro runs generate unique sign-up emails by default, while still allowing explicit `SIGNUP_EMAIL` overrides for reusable or multi-account scenarios.
- Expanded Maestro infrastructure with lane and matrix runners plus new docs in `apps/mobile/.maestro/` so broader smoke, cold-start, resilience, and multi-actor scenarios can be organized cleanly; also added stable messaging and notifications selectors to support future inbox/chat/follow-request flows.
- Added first messaging, notifications, social, resilience, and perf-sentinel Maestro journeys plus reusable header-entry helpers. Verification shows the new infrastructure compiles and lane discovery works; runtime validation on authenticated messaging flows still depends on valid reusable actor credentials because the checked-in `test@example.com` fixture is not currently a working app account.
