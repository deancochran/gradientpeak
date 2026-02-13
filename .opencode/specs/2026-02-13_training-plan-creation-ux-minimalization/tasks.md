# Tasks - Training Plan Creation UX Minimalization (In-Place Refactor)

Last Updated: 2026-02-13
Status: Ready for implementation
Owner: Mobile + QA

This checklist implements `./design.md` and `./plan.md` and explicitly preserves the current create process.

## Phase 1 - Simplify Current Form Surface

- [ ] [Mobile][S1] Refactor `apps/mobile/components/training-plan/create/SinglePageForm.tsx` to reduce default information density.
- [ ] [Mobile][S1] Keep current tab/screen process; do not introduce new multi-screen flow.
- [ ] [Mobile][S1] Keep goals, availability, and review as the default-visible journey in current UI.
- [ ] [Mobile][S1] Collapse advanced sections by default within current structure.
- [ ] [Mobile][S1] Keep forecast chart available but collapsed by default via toggle.
- [ ] [Mobile][S1] Add compact summary rows for key sections (value + edit/expand action) to reduce always-visible controls.
- [ ] [Mobile][S1] Remove duplicate helper or warning text shown in multiple places.

## Phase 2 - Add Typed Input Components

- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/DateField.tsx`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/DurationInput.tsx`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/PaceInput.tsx`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/BoundedNumberInput.tsx`.
- [ ] [Mobile][S1] Create `apps/mobile/components/training-plan/create/inputs/PercentSliderInput.tsx`.
- [ ] [Mobile][S1] Add shared parsing helpers in `apps/mobile/lib/training-plan-form/input-parsers.ts`.

## Phase 3 - Replace High-Risk Fields with Typed Inputs

- [ ] [Mobile][S2] Replace goal and plan date fields with `DateField` in `SinglePageForm.tsx`.
- [ ] [Mobile][S2] Replace duration/time target fields with `DurationInput`.
- [ ] [Mobile][S2] Replace pace fields with `PaceInput` and explicit unit label.
- [ ] [Mobile][S2] Replace session/rest count fields with `IntegerStepper` or bounded integer control.
- [ ] [Mobile][S2] Replace percent cap fields with `PercentSliderInput` plus numeric fallback.
- [ ] [Mobile][S2] Ensure distance inputs are bounded numeric with `km` context and optional preset chips.

## Phase 4 - Validation and Blocking UX in Current Flow

- [ ] [Mobile][S2] Add/update `apps/mobile/lib/training-plan-form/validation.ts` for field/section/submission validation.
- [ ] [Mobile][S2] Trigger inline validation on blur/change for date/time/pace/count fields.
- [ ] [Mobile][S2] In review section, surface top blocking conflicts (max 3) near create action.
- [ ] [Mobile][S2] Keep and reuse existing quick-fix actions for conflict resolution.
- [ ] [Mobile][S2] Disable create only when blocking issues exist, with explicit reason copy.
- [ ] [Mobile][S2] Ensure each blocking issue is shown once in a consolidated blocker area (no repeated warnings across sections).

## Phase 5 - Copy Simplification and Progressive Disclosure

- [ ] [Mobile][S2] Replace technical copy in default view with plain-language labels.
- [ ] [Mobile][S2] Keep provenance/lock/source details available only in expanded advanced sections.
- [ ] [Mobile][S2] Add unit/format helper text where needed (`mm:ss`, `h:mm:ss`, `%`, `km`).
- [ ] [Mobile][S2] Ensure accessibility labels/hints include expected input format.
- [ ] [Mobile][S2] Move long explanatory content behind per-section "Learn more" or "Show details" disclosures.
- [ ] [Mobile][S2] Keep default helper text to one concise line per section.

## Phase 6 - Regression Safety and QA

- [ ] [QA][S3] Add parser tests in `apps/mobile/lib/training-plan-form/__tests__/input-parsers.test.ts`.
- [ ] [QA][S3] Add validation tests in `apps/mobile/lib/training-plan-form/__tests__/validation.test.ts`.
- [ ] [QA][S3] Add component tests for new typed inputs under `apps/mobile/components/training-plan/create/inputs/__tests__/`.
- [ ] [QA][S3] Add/extend `SinglePageForm` behavior tests for blockers + create enablement.
- [ ] [QA][S3] Verify create/preview payload parity remains unchanged.

## Quality Gates

- [ ] [Mobile][S3] Run `pnpm --filter @repo/mobile check-types`.
- [ ] [Mobile][S3] Run `pnpm --filter @repo/mobile test`.
- [ ] [QA][S3] Run `pnpm check-types && pnpm lint && pnpm test` when feasible.

## Definition of Done

- [ ] Current training-plan create process is preserved and simplified in place.
- [ ] Advanced controls are default-collapsed, not removed.
- [ ] Typed inputs are used for date/time/pace/distance/count/percent fields.
- [ ] Blocking errors are visible and actionable before create.
- [ ] API contracts and create orchestration behavior remain backward compatible.
- [ ] Default screen state shows consolidated summaries; details are expandable on demand.
- [ ] Users can complete create on a minimal path without expanding advanced/details panels.
