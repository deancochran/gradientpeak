# Technical Plan: Training Plan Creation UX Minimalization (In-Place Refactor)

Last Updated: 2026-02-13
Status: Ready for execution
Depends On: `.opencode/specs/2026-02-13_training-plan-creation-ux-minimalization/design.md`
Owner: Mobile + QA

## Objective

Simplify the current `training-plan-create` form experience in place by reducing default complexity, upgrading to type-compatible input components, and improving pre-submit error handling, without changing API contracts or introducing a new process architecture.

## Non-Negotiables

1. Keep the existing create screen and orchestration path (`training-plan-create.tsx`).
2. Do not introduce a parallel wizard/process architecture.
3. Do not change `previewCreationConfig` / `createFromCreationConfig` contract shapes.
4. Preserve all advanced controls and expert behavior.
5. Reduce visible complexity in default mode.

## Scope

### In scope

- In-place UI simplification of `SinglePageForm`.
- Progressive disclosure in existing tabs/sections.
- Typed input controls for date, duration, pace, distance, counts, percentages.
- Earlier validation and clearer blocker messaging near create.

### Out of scope

- Backend schema/rule changes.
- New route architecture or multi-screen flow.
- Replacing the current creation process end-to-end.

## Files to Update

Primary:

- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

New reusable inputs:

- `apps/mobile/components/training-plan/create/inputs/DateField.tsx`
- `apps/mobile/components/training-plan/create/inputs/DurationInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/PaceInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx`
- `apps/mobile/components/training-plan/create/inputs/BoundedNumberInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/PercentSliderInput.tsx`

Utilities/tests:

- `apps/mobile/lib/training-plan-form/input-parsers.ts`
- `apps/mobile/lib/training-plan-form/validation.ts`
- `apps/mobile/lib/training-plan-form/__tests__/input-parsers.test.ts`
- `apps/mobile/lib/training-plan-form/__tests__/validation.test.ts`

## Implementation Phases

## Phase 1 - In-Place Information Density Reduction

### Scope

Reorganize existing form sections to reduce default cognitive load without changing process structure.

### Changes

1. In `SinglePageForm.tsx`, keep goals/availability/review content first in the primary user path.
2. Collapse advanced controls by default in existing tabs (constraints/influence details).
3. Hide source/provenance/lock detail from default view; show only when advanced section expands.
4. Keep existing chart available, but collapsed by default behind "Show forecast" toggle.

### Exit Criteria

1. Default form view is visibly simpler.
2. All advanced controls remain accessible through expansion.

## Phase 2 - Typed Input Components and Field Replacement

### Scope

Replace error-prone generic inputs with type-compatible components in the existing form.

### Mapping Requirements

- Goal/plan dates -> `DateField`
- Duration/time targets -> `DurationInput` (`h:mm:ss`)
- Pace targets -> `PaceInput` (`mm:ss` + unit)
- Distance -> bounded numeric input with `km` context
- Session/rest/day counts -> `IntegerStepper` or bounded integer input
- Percent caps -> `PercentSliderInput` + numeric fallback

### Example Usage

```tsx
<PaceInput
  valueSecondsPerKm={targetPaceSeconds}
  onValueChange={setTargetPaceSeconds}
  unitLabel="/km"
/>
```

### Exit Criteria

1. No critical date/time/pace/count field relies solely on free-text entry.
2. All typed inputs include units and format-aware error messaging.

## Phase 3 - Validation and Error Communication Hardening

### Scope

Improve error timing and actionability inside the current form structure.

### Changes

1. Add field-level validation triggers (`blur` + constrained `change`) for typed fields.
2. Add section validation summaries in context (Goals, Availability, Review).
3. In review area, show top blockers (max 3) with existing quick-fix actions.
4. Disable Create only on blocking errors and show reason copy.

### Example Blocking Copy Rule

```ts
const createDisabledReason = hasBlockingIssues
  ? "Resolve blocking issues before creating your plan"
  : undefined;
```

### Exit Criteria

1. Users see and can fix blockers before submit.
2. Failed submits due to format issues are reduced.

## Phase 4 - Copy and Label Simplification

### Scope

Keep existing domain behavior, but simplify wording and labels.

### Changes

1. Replace technical labels in default view with user language.
2. Keep deep technical explanations inside advanced disclosures.
3. Add unit/format hints directly in labels or helper text.

### Exit Criteria

1. Default content reads as outcome-focused, not model-focused.
2. Advanced detail remains available when needed.

## Phase 5 - QA, Regression Safety, and Rollout

### Scope

Validate no contract regressions and verify UX improvements.

### Checks

1. Payload parity before/after for create + preview requests.
2. Quick-fix conflict behavior remains unchanged.
3. Typed inputs parse and serialize correctly.
4. Accessibility labels/hints present on specialized fields.

### Commands

```bash
pnpm --filter @repo/mobile check-types
pnpm --filter @repo/mobile test
pnpm check-types && pnpm lint && pnpm test
```

## Nice-to-Haves

1. Add preset chips for common distances and durations.
2. Add optional haptic feedback for invalid boundary taps on steppers.
3. Add analytics events for blocked-create reasons.

## Definition of Done

1. Current form process is preserved and simplified in place.
2. Advanced controls remain but are default-collapsed.
3. Typed components are used for date/time/pace/distance/count/percent fields.
4. Blocking issues are surfaced clearly before create.
5. API contract behavior remains backward compatible.
