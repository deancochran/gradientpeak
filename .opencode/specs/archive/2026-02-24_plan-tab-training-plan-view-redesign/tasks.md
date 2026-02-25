# Tasks - Plan Tab & Training Plan View Redesign

Last Updated: 2026-02-24
Status: Active
Owner: Mobile + Product + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Baseline, Contracts, and Safety Refactor

- [ ] Snapshot current Plan Tab and TPV behavior with a quick route/component inventory.
- [ ] Extract large `plan.tsx` sections into modular components without behavior changes.
- [ ] Confirm baseline routing contracts before ownership changes:
  - [ ] Plan Tab -> TPV
  - [ ] Plan Tab -> record/start flow
  - [ ] TPV deep-link with `id`
- [ ] Preserve `useTrainingPlanSnapshot` as the shared data backbone; no alternate hook layer.
- [ ] Run baseline targeted tests before feature edits.

## Phase 1 - Plan Tab Ownership Cleanup (Execution-First)

- [ ] Refactor Plan Tab to prioritize:
  - [ ] Active Plan Header
  - [ ] Next Up Card
  - [ ] Upcoming Obligations (next 72h)
  - [ ] Compact Calendar Block
  - [ ] Weekly Snapshot Strip
  - [ ] Lightweight Health Indicator Chips
- [ ] Remove ownership-violating controls from Plan Tab:
  - [ ] Remove `Manage Plan` CTA
  - [ ] Remove `Edit Structure` CTA
- [ ] Keep one-tap `Open Full Plan` entry to TPV.
- [ ] Keep quick execution actions (`Start`, `View Details`) above the fold.
- [ ] Ensure no full-plan architecture or heavy analytics duplication remains in Plan Tab.

## Phase 2 - Training Plan View Ownership Expansion

- [ ] Add top horizontal insight gallery in TPV near summary/header.
- [ ] Add required gallery cards:
  - [ ] Adherence
  - [ ] Readiness (replace capability label)
- [ ] Add recommended supporting cards (if low-risk in same pass):
  - [ ] Fatigue trend
  - [ ] Event readiness/risk
- [ ] Keep TPV as sole surface for management and structure-edit authority.
- [ ] Preserve existing settings/edit navigation behavior in TPV.

## Phase 3 - Insight Modal Drill-Downs

- [ ] Reuse `DetailChartModal` for card drill-downs (do not create parallel modal primitive).
- [ ] Implement Adherence modal content:
  - [ ] Metric definition
  - [ ] Current interpretation
  - [ ] Contributor breakdown
  - [ ] Time-range toggle handling
  - [ ] Recommended action CTA
- [ ] Implement Readiness modal content:
  - [ ] Metric definition
  - [ ] Current interpretation
  - [ ] Contributor breakdown
  - [ ] Time-range toggle handling
  - [ ] Recommended action CTA
- [ ] Support close via both button and native gesture.
- [ ] Add loading/empty/error states for modal content.

## Phase 4 - Deep-Link Focused Edit Flows (Two-Interaction Goal)

- [ ] Add Plan Tab obligation row actions that deep-link into TPV focused editor contexts.
- [x] Extend TPV query-param parsing for focused intents (e.g., `nextStep`, `activityId`, optional focus key).
- [ ] Implement focused entry flows for common tasks:
  - [ ] Edit planned workout note -> Save
  - [ ] Adjust intent/intensity preset -> Save
  - [ ] Move/reschedule day chip -> auto-save/submit
- [ ] Confirm common edit+submit flows complete in two interactions from Plan Tab entry.
- [ ] Add additive typed route helper only if needed (no route family rewrite).

## Phase 5 - Data Contract Additions (Conditional)

- [ ] Validate whether current insight payload fully supports readiness/adherence modal details.
- [ ] If insufficient, add additive fields to training plan analytics response only.
- [ ] Keep backward compatibility for existing consumers.
- [ ] Add contract tests for any new response fields.
- [ ] Wire new fields into TPV modal content with graceful fallback logic.

## Phase 6 - Test Updates and Coverage

- [x] Update `apps/mobile/app/(internal)/(tabs)/__tests__/plan-navigation.test.tsx`:
  - [x] Remove assertions expecting Plan Tab `Manage Plan` / `Edit Structure`
  - [ ] Add assertions for one-tap primary destinations
  - [x] Add assertion for `Open Full Plan` path
- [x] Update `apps/mobile/app/(internal)/(standard)/__tests__/training-plan-deeplink.test.tsx`:
  - [x] Add focused-edit deep-link behavior assertions
  - [x] Preserve existing `id` deep-link behavior assertions
- [ ] Add TPV gallery tests:
  - [ ] Adherence and Readiness cards render
  - [ ] Tapping card opens modal
  - [ ] Modal date-range toggles update content
  - [ ] Modal closes correctly
- [ ] Add fallback-state tests for missing contributor data.

## Phase 7 - Validation and QA Pass

- [ ] Manual UX QA on mobile form factors (small + large phone sizes).
- [ ] Verify thumb-target and above-the-fold action priorities.
- [ ] Verify chronological obligations ordering and status chips.
- [ ] Verify no duplicated ownership between Plan Tab and TPV.
- [x] Verify terminology consistency (`Readiness` replaces legacy `Capability` labels in user-facing copy).

## Quality Gates

- [ ] `pnpm --filter @apps/mobile check-types`
- [ ] `pnpm --filter @apps/mobile test`
- [ ] `pnpm check-types`
- [ ] `pnpm lint`
- [ ] `pnpm test`

## Definition of Done

- [ ] Plan Tab is execution-first and no longer exposes TPV ownership controls.
- [ ] TPV is the canonical surface for Analyze, Manage Plan, and Edit Structure.
- [ ] Adherence and Readiness gallery cards exist with modal drill-down details.
- [ ] One-tap primary navigation and two-interaction common edit-submit flows are verified.
- [ ] Architecture remains incremental/additive (no route-system rewrite, no backend schema overhaul, no full screen replacement).
