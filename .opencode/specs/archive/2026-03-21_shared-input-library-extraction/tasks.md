# Tasks: Shared Input Library Extraction + Story Surface

## Coordination Rules

- [x] Each extracted component follows `shared.ts`, `index.web.tsx`, `index.native.tsx`, and `fixtures.ts`.
- [x] A task is complete only when code lands and focused validation passes.
- [x] If a component cannot support the full preview path, note the fallback test surface inline.

## Phase 1: Scope Lock

- [x] Task A - Archive the unrelated active recording spec from session focus. Success: `.opencode/tasks/index.md` no longer treats the recording spec as the active pending work item.
- [x] Task B - Register the shared-input extraction spec. Success: `design.md`, `plan.md`, and `tasks.md` exist under `.opencode/specs/2026-03-21_shared-input-library-extraction/`.

## Phase 2: Primitive Gap Fill

- [x] Task C - Add missing cross-platform file contracts for `switch`, `checkbox`, `select`, `slider`, `textarea`, and `radio-group`. Success: each folder has `shared.ts`, `index.web.tsx`, `index.native.tsx`, and `fixtures.ts`.
- [x] Task D - Add `file-input` and `date-input` to `packages/ui`. Success: both inputs support web and native entrypoints with shared fixtures.
- [x] Task E - Add browser stories for preview-safe primitives. Success: web Storybook loads dedicated stories for the extracted primitive inputs.

## Phase 3: Domain Fitness Inputs

- [x] Task F - Extract reusable fitness inputs into `packages/ui`. Success: bounded number, integer stepper, duration, pace, number slider, percent slider, pace seconds, and weight field live in the shared package.
- [x] Task G - Keep shared fixtures for every extracted fitness input. Success: each fitness-input folder has `fixtures.ts` consumed by story/test surfaces.

## Phase 4: Cutover

- [x] Task H - Convert mobile-local input owners into thin wrappers or shared consumers. Success: the original app-local component files no longer own the reusable logic.
  - Progress 2026-03-21: removed the `@repo/ui` `fitness-inputs` compatibility shim, moved `parseDistanceKmToMeters` into `@repo/core`, and switched mobile validation availability counting to `countAvailableTrainingDays` from core.
  - Progress 2026-03-21: moved onboarding metric estimators into `packages/core/estimation/defaults.ts`, deleted `apps/mobile/lib/profile/metricUnits.ts`, moved composite calibration helpers into `packages/core/plan/compositeCalibration.ts`, and deleted the remaining mobile-local calibration helper module/tests.
  - Progress 2026-03-21: moved training-plan blocking/goal-gap helper logic into `packages/core/plan/creationBlockers.ts`, moved stream downsampling helpers into `packages/core/utils/stream-sampling.ts`, updated mobile consumers to import from `@repo/core`, and deleted `apps/mobile/lib/utils/streamSampling.ts`.
  - Progress 2026-03-21: moved goal draft/payload/summary helpers into `packages/core/goals/goalDraft.ts`, exported them through `@repo/core`, updated mobile goal consumers to import from core, and deleted the mobile-local `goalDraft` module.
  - Progress 2026-03-21: added shared controlled form wrappers plus `useZodForm` in `packages/ui`, then cut `apps/mobile/components/settings/ProfileSection.tsx` over from hand-written RHF `Controller` wiring to `FormTextField` and `FormBoundedNumberField`.
  - Progress 2026-03-21: expanded the shared form system with `FormTextareaField`, `FormSelectField`, `FormDateInputField`, and `FormWeightInputField`, then cut `apps/mobile/app/(internal)/(standard)/profile-edit.tsx` and `apps/mobile/app/(external)/sign-up.tsx` further over to the shared wrappers and `useZodForm`.
  - Progress 2026-03-21: added `FormIntegerStepperField`, cut `apps/mobile/app/(internal)/(standard)/activity-effort-create.tsx` over to `FormIntegerStepperField`/`FormBoundedNumberField`/`FormTextField`, and switched `apps/mobile/app/(internal)/(standard)/profile-edit.tsx` preferred-units selection to `FormSelectField`.
  - Progress 2026-03-21: added a shared `useZodFormSubmit` helper in `@repo/ui/hooks`, cut `apps/mobile/app/(internal)/record/submit.tsx` over to `FormTextField`/`FormTextareaField`/`FormSelectField`, and adapted `apps/mobile/components/training-plan/create/tabs/ConstraintsTab.tsx` to use `FormSelectField` through local `useZodForm` adapters while preserving the external config state model.
  - Progress 2026-03-21: moved `ConstraintsTab` session-count and duration steppers onto `FormIntegerStepperField`, and switched `ScheduleActivityModal` from raw RHF wiring to `useZodForm`, `useZodFormSubmit`, `FormDateInputField`, and `FormTextareaField`.
  - Progress 2026-03-21: added shared `FormDurationField` and `FormPaceField` wrappers in `@repo/ui`, partially converted `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx` onto `useZodForm` and shared text/textarea form wrappers, and started trimming app-local wrapper re-exports by switching several training-plan forms to direct `@repo/ui/components/integer-stepper` imports.
  - Progress 2026-03-21: added a reusable `FormNumberField` helper for numeric RHF wiring, used it to finish the shared-field conversion of `StepEditorDialog` target rows, and trimmed more mobile wrapper re-exports by switching onboarding and goal-editor screens to direct `@repo/ui` imports for `WeightInputField`, `DateInput`, and `BoundedNumberInput`.
  - Progress 2026-03-21: finished the remaining custom `StepEditorDialog` duration section by extracting a dedicated `StepDurationField` helper, and continued trimming app-local wrappers by routing more screens to direct `@repo/ui` inputs while keeping the remaining custom `PaceSecondsField` adapter intact.
  - Progress 2026-03-21: moved the auth flow screens (`sign-in`, `forgot-password`, `verify`) onto `useZodForm` plus shared `FormTextField` wiring, and deleted now-obsolete mobile wrapper files for `PaceSecondsField`, `DurationInput`, `PaceInput`, and `IntegerStepper` after cutting remaining consumers/tests over to direct `@repo/ui` imports.
  - Progress 2026-03-21: moved `reset-password` onto `useZodForm` plus shared `FormTextField` wiring, switched the remaining `DateField` and `BoundedNumberInput` consumers to direct `@repo/ui` imports, and deleted the now-unused `DateField` and `BoundedNumberInput` mobile wrapper files.
  - Progress 2026-03-21: switched `TrainingPlanComposerScreen` from raw `useForm + zodResolver` to `useZodForm`, routed remaining `PercentSliderInput` and `NumberSliderInput` consumers to direct `@repo/ui` imports, and deleted those last adapter files.
- [x] Task I - Cut obvious web settings controls over to shared primitives. Success: settings upload/toggle no longer rely on hand-rolled controls.
  - Progress 2026-03-21: extended `packages/ui` form primitives with thin controlled RHF wrappers (`FormTextField`, `FormSwitchField`, `FormBoundedNumberField`) and a `useZodForm` adapter, then cut `apps/web/src/app/(internal)/settings/page.tsx` over to the new shared form fields.

## Validation Gate

- [x] Validation 1 - `@repo/ui` typechecks.
- [x] Validation 2 - focused `@repo/ui` tests pass.
- [x] Validation 3 - `web` and `mobile` typechecks pass.
  - Progress 2026-03-21: reran `pnpm --filter @repo/ui check-types`, `pnpm --filter mobile check-types`, `pnpm --filter web check-types`, `pnpm --filter @repo/ui test:web -- --run src/components/form-fields/index.web.test.tsx`, and `pnpm --filter @repo/ui test:native -- src/components/form-fields/index.native.test.tsx`. The web/native test commands passed, though this repo's current `test:web` script still executes the broader `@repo/ui` web suite and surfaces the same pre-existing act warnings from unrelated Radix tests.
  - Progress 2026-03-21: reran focused checks after the second wrapper batch (`FormTextareaField`, `FormDateInputField`, `FormWeightInputField`, `FormSelectField`) and additional app cutovers; `@repo/ui`, `mobile`, and `web` typechecks passed, and the focused `@repo/ui` web/native form-field test commands passed.
  - Progress 2026-03-21: updated the `mobile-frontend`, `web-frontend`, and `ui-package` subagent skills so future specialized agents prefer `@repo/ui` form wrappers and `useZodForm` over ad hoc RHF controller wiring.
  - Progress 2026-03-21: after adding `useZodFormSubmit` and the next mobile cutovers, `mobile` typecheck and focused `@repo/ui` web/native form-field tests still passed. `@repo/ui` typecheck is green again after fixing `packages/ui/src/components/loading-skeletons/index.native.test.tsx`. A later attempt to run targeted mobile tests still executed the broader suite and exposed unrelated pre-existing failures in native wrapper tests and route import resolution outside this work.
  - Progress 2026-03-21: after adding `FormDurationField`/`FormPaceField` and further trimming direct wrapper imports, `@repo/ui` and `mobile` typechecks remained green and the focused shared-form web/native tests continued to pass.
  - Progress 2026-03-21: added focused shared-form tests covering `FormDurationField` and `FormPaceField`; `@repo/ui` and `mobile` typechecks stayed green, and the focused web/native form-field test commands passed.
  - Progress 2026-03-21: after the auth-screen cutovers and wrapper deletions, `@repo/ui` and `mobile` typechecks remained green and the focused shared-form web/native test commands still passed.
  - Progress 2026-03-21: attempted to add an app-local `StepDurationField` test, but the mobile Vitest setup still cannot execute that app component directly due existing JSX transform limitations; retained focused shared-form wrapper coverage in `@repo/ui` instead.
  - Progress 2026-03-21: after the composer and slider-input cleanup pass, `mobile` and `@repo/ui` typechecks remained green and no runtime consumer references to the deleted adapter paths remained.
