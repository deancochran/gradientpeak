# Tasks - Training Plan Creation UX Minimalization

Last Updated: 2026-02-13
Status: Ready for implementation
Owner: Mobile + Core + tRPC + QA

This checklist implements `./design.md` and `./plan.md`.

## Phase 1 - Feature Flag and Minimal Flow Shell

- [ ] [Mobile][S1] Add `trainingPlanCreateUxMinimalization` flag in `apps/mobile/lib/constants/features.ts`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx` with 3-step shell (`goal`, `availability`, `review`).
- [ ] [Mobile][S1] Wire conditional rendering in `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` to use minimal flow when flag is enabled.
- [ ] [Mobile][S1] Keep `apps/mobile/components/training-plan/create/SinglePageForm.tsx` as fallback path while migration is in progress.
- [ ] [QA][S1] Verify no create/preview API contract changes from shell introduction.

## Phase 2 - Typed Input Component Foundation (Best-Practice UX)

- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/DateField.tsx` using native `DateTimePicker`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/DurationInput.tsx` for `h:mm:ss` entry with format-safe behavior.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/PaceInput.tsx` for `mm:ss` with explicit unit label.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/BoundedNumberInput.tsx` for numeric + min/max constraints.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx` for bounded integer counts.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/PercentSliderInput.tsx` for percentage caps with numeric fallback.
- [ ] [Mobile][S1] Add `apps/mobile/lib/training-plan-form/input-parsers.ts` for shared date/time/pace/distance parsing/formatting utilities.
- [ ] [QA][S1] Add parser unit tests in `apps/mobile/lib/training-plan-form/__tests__/input-parsers.test.ts`.

## Phase 3 - Goal Step (Minimal Required, Inline Editing)

- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/steps/GoalStep.tsx`.
- [ ] [Mobile][S1] Use typed controls for goal fields:
  - [ ] `DateField` for target date and plan start date
  - [ ] `DurationInput` for completion/test duration
  - [ ] `PaceInput` for pace threshold values
  - [ ] Numeric distance input with `km` suffix and quick-preset chips
- [ ] [Mobile][S1] Replace target-edit modal dependency with inline expandable target cards in `GoalStep`.
- [ ] [Mobile][S1] Keep optional goals behind explicit "Add another goal" action.
- [ ] [Mobile][S1] Add/retain accessibility labels and hints that specify required format and units.
- [ ] [QA][S1] Add goal-step interaction tests covering inline edit and typed input validation.

## Phase 4 - Availability Step (Minimal Required, Type-Compatible Inputs)

- [ ] [Mobile][S2] Create `apps/mobile/components/training-plan/create/steps/AvailabilityStepMinimal.tsx`.
- [ ] [Mobile][S2] Implement training day toggles and selected-day summary.
- [ ] [Mobile][S2] Implement min/max sessions/week using `IntegerStepper` or bounded integer control.
- [ ] [Mobile][S2] Enforce min<=max and available-day consistency with immediate feedback.
- [ ] [Mobile][S2] Keep conservative defaults visible without exposing provenance internals in minimal path.
- [ ] [QA][S2] Add availability-step tests for invalid ranges and progression gating.

## Phase 5 - Review Step, Blocking Guidance, and Create Rules

- [ ] [Mobile][S2] Create `apps/mobile/components/training-plan/create/steps/ReviewStep.tsx` with plain-language summary blocks.
- [ ] [Mobile][S2] Create `apps/mobile/components/training-plan/create/FixBeforeCreateCard.tsx` for top blockers (max 3).
- [ ] [Mobile][S2] Surface feasibility/safety bands in review without leaking internal jargon.
- [ ] [Mobile][S2] Disable Create only when blocked; show explicit disabled-reason copy.
- [ ] [Mobile][S2] Reuse existing quick-fix handler (`onResolveConflict`) from create screen orchestration.
- [ ] [QA][S2] Add review-step tests for blocking conflict rendering and quick-fix interactions.

## Phase 6 - Advanced Settings Progressive Disclosure

- [ ] [Mobile][S2] Create `apps/mobile/components/training-plan/create/AdvancedSettingsSection.tsx`.
- [ ] [Mobile][S2] Move advanced controls from `SinglePageForm.tsx` into `AdvancedSettingsSection` while preserving behavior.
- [ ] [Mobile][S2] Default advanced section to collapsed state; require explicit user expansion.
- [ ] [Mobile][S2] Keep lock controls and provenance/source indicators in advanced section only.
- [ ] [Mobile][S2] Upgrade advanced numeric controls to typed components (`PercentSliderInput`, `IntegerStepper`, bounded numeric).
- [ ] [QA][S2] Verify advanced path exposes all prior expert controls and values persist correctly.

## Phase 7 - Validation Architecture and Orchestration Wiring

- [ ] [Mobile][S3] Add `apps/mobile/lib/training-plan-form/validation.ts` with:
  - [ ] `validateGoalStep`
  - [ ] `validateAvailabilityStep`
  - [ ] `validateCreateSubmission`
- [ ] [Mobile][S3] Trigger field-level validation on blur/change for date/time/pace/count critical fields.
- [ ] [Mobile][S3] Add step-level gating in `training-plan-create.tsx` + `MinimalCreateFlow.tsx`.
- [ ] [Mobile][S3] Keep submit-level validation + preview guard before create mutation.
- [ ] [Mobile][S3] Keep data adapters unchanged in `apps/mobile/lib/training-plan-form/adapters.ts` to preserve payload contract.
- [ ] [QA][S3] Add regression tests confirming no payload drift for `createFromCreationConfig` inputs.

## Phase 8 - Forecast Toggle, QA Hardening, and Rollout

- [ ] [Mobile][S3] Add default-collapsed forecast toggle (`Show forecast`) around `CreationProjectionChart`.
- [ ] [Mobile][S3] Ensure chart remains optional and does not block minimal flow completion.
- [ ] [QA][S3] Add component tests:
  - [ ] `apps/mobile/components/training-plan/create/__tests__/MinimalCreateFlow.test.tsx`
  - [ ] `apps/mobile/components/training-plan/create/inputs/__tests__/DateField.test.tsx`
  - [ ] `apps/mobile/components/training-plan/create/inputs/__tests__/DurationInput.test.tsx`
  - [ ] `apps/mobile/components/training-plan/create/inputs/__tests__/PaceInput.test.tsx`
- [ ] [QA][S3] Execute manual QA script from plan (minimal completion, typed input validation, blocking fixes, advanced path, forecast toggle).
- [ ] [Product+QA][S3] Verify event telemetry requirements if enabled (`step_view`, `step_blocked`, `quick_fix_applied`, `create_success`).

## Quality Gates

- [ ] [Mobile][S3] Run `pnpm --filter @repo/mobile check-types`.
- [ ] [Mobile][S3] Run `pnpm --filter @repo/mobile test`.
- [ ] [QA][S3] Run full validation when feasible: `pnpm check-types && pnpm lint && pnpm test`.

## Definition of Done

- [ ] Minimal create flow is 3-step and fully completable without opening advanced settings.
- [ ] Advanced controls are preserved and hidden by default.
- [ ] Date/time/pace/distance/session/count fields use type-compatible components with unit-aware UX.
- [ ] Blocking issues are surfaced before create with direct correction actions.
- [ ] Preview/create payload and endpoint contracts remain backward compatible.
- [ ] Automated and manual validation checks pass.
