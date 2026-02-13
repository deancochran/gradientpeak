# Technical Plan: Training Plan Creation UX Minimalization

Last Updated: 2026-02-13
Status: Ready for execution
Depends On: `.opencode/specs/2026-02-13_training-plan-creation-ux-minimalization/design.md`
Owner: Mobile + Core + tRPC + QA

## Objective

Implement a minimal, low-error training plan creation flow that keeps current backend contracts and planning logic intact while reducing decision load through a 3-step UI and progressive disclosure.

## Non-Negotiables

1. No breaking change to `previewCreationConfig` or `createFromCreationConfig` payload contracts.
2. Users can complete creation without opening advanced settings.
3. Advanced controls remain fully available (hidden by default, not removed).
4. Blocking conflicts must be visible before create with direct correction paths.
5. Existing safety/feasibility computation remains authoritative in core/tRPC.

## Current-State Analysis (Implementation Implications)

Current hotspots:

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
  - Strong orchestration already exists and should be preserved.
  - Submit-time validation should be split into field/step validation hooks.
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
  - Contains UI for all tabs, advanced options, review, and target editing modal in one component.
  - Needs decomposition into focused step components.
- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`
  - Keep logic, but default to collapsed display in minimal flow.

Useful reusable assets already in repo:

- `apps/mobile/components/training-plan/create/WizardStep.tsx`
- `apps/mobile/components/training-plan/create/steps/GoalSelectionStep.tsx`
- `apps/mobile/components/training-plan/create/steps/AvailabilityStep.tsx`

These can be reused/adapted to accelerate migration, but avoid duplicating state models.

## Architecture Direction

### UI decomposition

Refactor `SinglePageForm` into a step shell plus focused step sections:

- `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx` (new)
- `apps/mobile/components/training-plan/create/steps/GoalStep.tsx` (new)
- `apps/mobile/components/training-plan/create/steps/AvailabilityStepMinimal.tsx` (new)
- `apps/mobile/components/training-plan/create/steps/ReviewStep.tsx` (new)
- `apps/mobile/components/training-plan/create/AdvancedSettingsSection.tsx` (new)
- `apps/mobile/components/training-plan/create/FixBeforeCreateCard.tsx` (new)

### Typed input component layer (best-practice UX)

Add reusable domain input components and use them in the 3-step flow:

- `apps/mobile/components/training-plan/create/inputs/DateField.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/DurationInput.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/PaceInput.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/BoundedNumberInput.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/PercentSliderInput.tsx` (new)

Primary requirement: avoid generic free-text `Input` when a typed control exists for the same domain value.

Retain `SinglePageForm.tsx` behind a flag during migration.

### State ownership

Keep source-of-truth state in `training-plan-create.tsx`:

- `formData`
- `configData`
- `errors`
- preview/suggestions/conflicts state

Add step UI state:

- `currentStep: "goal" | "availability" | "review"`
- `showAdvanced: boolean`
- `showForecast: boolean`

### Contract safety

No changes to mapping adapters:

- `apps/mobile/lib/training-plan-form/adapters.ts`

No changes to payload usage:

- `buildMinimalTrainingPlanPayload`
- `toCreationNormalizationInput`

## Implementation Phases

## Phase 1 - 3-Step Shell and Feature Flag

### Scope

Introduce new minimal flow shell and wire it behind a feature flag while preserving current form path.

### Files

- `apps/mobile/lib/constants/features.ts`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx` (new)
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`

### Changes

1. Add feature flag:

```ts
// apps/mobile/lib/constants/features.ts
export const featureFlags = {
  trainingPlanCreateConfigMvp: true,
  trainingPlanCreateUxMinimalization: true,
} as const;
```

2. Render new shell when flag is enabled; fallback to `SinglePageForm` otherwise.
3. Preserve existing create orchestration (`handleCreate`, preview refresh, mutations).

### Exit Criteria

1. App can switch between legacy and minimal flow via flag.
2. No payload or endpoint behavior changes.

## Phase 2 - Goal and Availability Steps (Minimal Required Inputs)

### Scope

Implement Step 1 and Step 2 with step-level validation and navigation gating.

### Files

- `apps/mobile/components/training-plan/create/steps/GoalStep.tsx` (new)
- `apps/mobile/components/training-plan/create/steps/AvailabilityStepMinimal.tsx` (new)
- `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

### Changes

1. Step 1 fields:
   - primary goal name
   - primary goal date via `DateField`
   - primary goal target editor (inline, not modal) with typed inputs:
     - duration via `DurationInput`
     - pace via `PaceInput`
     - distance via numeric input with `km` suffix + preset chips
2. Step 2 fields:
   - training day toggles
   - min/max sessions per week via `IntegerStepper` or bounded integer input
3. Add step validators:
   - `validateGoalStep(formData)`
   - `validateAvailabilityStep(configData)`

### Example Step-Gating Logic

```ts
type CreateStep = "goal" | "availability" | "review";

const canContinueFromGoal = validateGoalStep(formData).valid;
const canContinueFromAvailability = validateAvailabilityStep(configData).valid;

const goNext = () => {
  if (currentStep === "goal" && canContinueFromGoal)
    setCurrentStep("availability");
  else if (currentStep === "availability" && canContinueFromAvailability)
    setCurrentStep("review");
};
```

### Exit Criteria

1. User can progress only when required fields are valid.
2. Inline field errors appear in-step, not only on submit.
3. Goal/date/time/pace/session fields all use type-compatible controls.

## Phase 3 - Review Step, Blocking Surface, and Create CTA Rules

### Scope

Implement plain-language review summary with focused blocking issues and direct fixes.

### Files

- `apps/mobile/components/training-plan/create/steps/ReviewStep.tsx` (new)
- `apps/mobile/components/training-plan/create/FixBeforeCreateCard.tsx` (new)
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

### Changes

1. Show concise review blocks:
   - goal summary
   - weekly availability summary
   - feasibility/safety band chips
2. Add top blockers card (max 3 issues):
   - prioritize `conflictItems` with `severity === "blocking"`
   - include `Apply quick fix` action using existing `onResolveConflict`
3. Create CTA logic:
   - enabled when no blocking conflicts and form valid
   - disabled with explicit reason copy when blocked

### Example Blocking Aggregator

```ts
const blockingIssues = conflictItems
  .filter((item) => item.severity === "blocking")
  .slice(0, 3);

const createDisabledReason =
  blockingIssues.length > 0
    ? "Resolve blocking issues before creating"
    : undefined;
```

### Exit Criteria

1. Users see blockers before tapping Create.
2. Quick-fix flow reuses existing resolver and updates preview.

## Phase 4 - Advanced Settings Progressive Disclosure

### Scope

Move expert controls under collapsed advanced section, preserving behavior.

### Files

- `apps/mobile/components/training-plan/create/AdvancedSettingsSection.tsx` (new)
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` (source extraction)
- `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx`

### Changes

1. Extract these sections from existing `SinglePageForm`:
   - availability template + day windows
   - recent influence controls
   - constraints and safety caps
   - lock switches and provenance UI
2. Render in collapsed accordion (`showAdvanced === false` by default).
3. Keep all current field names and update callbacks unchanged.
4. Upgrade advanced numeric controls to typed components:
   - `%` caps -> `PercentSliderInput` with numeric fallback
   - counts/days -> `IntegerStepper` or bounded integer input
   - durations -> `DurationInput` where applicable

### Exit Criteria

1. Advanced controls are hidden by default.
2. Power users can still reach all previous controls.

## Phase 5 - Interaction Simplification (Inline Target Editor + Forecast Collapse)

### Scope

Reduce context switching by removing target edit modal and collapsing forecast by default.

### Files

- `apps/mobile/components/training-plan/create/steps/GoalStep.tsx`
- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`
- `apps/mobile/components/training-plan/create/MinimalCreateFlow.tsx`

### Changes

1. Replace modal editor pattern with inline expandable target cards.
2. Keep same target-type logic and validation keys.
3. Add "Show forecast" toggle; chart collapsed by default.

### Example Forecast Toggle

```tsx
<Button variant="outline" size="sm" onPress={() => setShowForecast((v) => !v)}>
  <Text>{showForecast ? "Hide forecast" : "Show forecast"}</Text>
</Button>;
{
  showForecast ? (
    <CreationProjectionChart
      projectionChart={projectionChart}
      isPreviewPending={isPreviewPending}
    />
  ) : null;
}
```

### Exit Criteria

1. No target-edit modal is required in default path.
2. Forecast remains available but does not dominate initial screen.

## Validation Strategy (Technical)

### Step validators (new utility module)

Add:

- `apps/mobile/lib/training-plan-form/validation.ts` (new)

Functions:

- `validateGoalStep(formData): { valid: boolean; errors: Record<string, string> }`
- `validateAvailabilityStep(configData): { valid: boolean; errors: Record<string, string> }`
- `validateCreateSubmission(formData, configData): { valid: boolean; errors: Record<string, string> }`

Implementation note: reuse parsing helpers already in `training-plan-create.tsx` where possible; migrate helpers into shared utility if needed.

### Typed input parsing utilities

Add:

- `apps/mobile/lib/training-plan-form/input-parsers.ts` (new)

Suggested exports:

- `parseDurationHms(value: string): number | undefined`
- `formatDurationHms(seconds: number | undefined): string`
- `parsePaceMmSs(value: string): number | undefined`
- `formatPaceMmSs(seconds: number | undefined): string`
- `parseDistanceKm(value: string): number | undefined`

Rule: components emit normalized numeric values upstream where possible; string formatting stays local to input UI.

### Error timing

1. On blur/change: field-level errors for critical fields.
2. On next-step: step-level gate with focused messages.
3. On create: full validation + preview blocking check.

## Data Flow and API Calls (No Contract Changes)

Keep current data path intact:

1. User edits `formData` + `configData`.
2. `refreshPreview` computes feasibility/conflicts.
3. `handleCreate` validates -> preview guard -> `createFromCreationConfig` mutation.

No changes to:

- `trpc.trainingPlans.previewCreationConfig`
- `trpc.trainingPlans.createFromCreationConfig`
- `trpc.trainingPlans.getCreationSuggestions`

## Testing Plan

## Unit tests (mobile)

- `apps/mobile/lib/training-plan-form/__tests__/validation.test.ts` (new)
  - goal step validation cases
  - availability step min/max/session-day constraints
  - submission aggregation behavior
- `apps/mobile/lib/training-plan-form/__tests__/input-parsers.test.ts` (new)
  - duration parsing/format edge cases
  - pace parsing/format edge cases
  - numeric bounds and clamping behavior

## Component tests (mobile)

- `apps/mobile/components/training-plan/create/__tests__/MinimalCreateFlow.test.tsx` (new)
  - step gating behavior
  - advanced section default collapsed
  - create disabled reason on blocking conflicts
- `apps/mobile/components/training-plan/create/inputs/__tests__/DurationInput.test.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/__tests__/PaceInput.test.tsx` (new)
- `apps/mobile/components/training-plan/create/inputs/__tests__/DateField.test.tsx` (new)

## Integration/regression checks

- ensure create payload snapshot parity before/after UX refactor
- ensure quick-fix actions still mutate config as expected

## Manual QA Script

1. Create with only minimal fields (no advanced edits) -> success.
2. Enter invalid target time/pace -> inline error appears before review.
3. Set invalid session min/max -> cannot proceed to review.
4. Force blocking conflict -> see top blockers and apply quick fix.
5. Open advanced section -> all previous expert controls available.
6. Toggle forecast on/off -> chart loads and does not break step flow.
7. Date/time/pace/distance/session fields only accept valid type-compatible input and show units clearly.

## Implementation Snippets (Typed Inputs)

### 1) Date field wrapper

```tsx
// apps/mobile/components/training-plan/create/inputs/DateField.tsx
<Pressable
  onPress={() => setOpen(true)}
  className="rounded-md border border-input bg-background px-3 py-3"
>
  <Text>{value ? format(value, "EEE, MMM d, yyyy") : placeholder}</Text>
</Pressable>;
{
  open ? (
    <DateTimePicker
      value={value ?? new Date()}
      mode="date"
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      onChange={handleChange}
    />
  ) : null;
}
```

### 2) Duration input (`h:mm:ss`)

```tsx
// apps/mobile/components/training-plan/create/inputs/DurationInput.tsx
<Input
  keyboardType="numbers-and-punctuation"
  value={displayValue}
  onChangeText={setDisplayValue}
  onBlur={() => onValueChange(parseDurationHms(displayValue))}
  placeholder="h:mm:ss"
  accessibilityHint="Enter duration using hours, minutes, and seconds"
/>
```

### 3) Pace input (`mm:ss`)

```tsx
// apps/mobile/components/training-plan/create/inputs/PaceInput.tsx
<View className="flex-row items-center gap-2">
  <Input
    keyboardType="numbers-and-punctuation"
    value={displayValue}
    onChangeText={setDisplayValue}
    onBlur={() => onValueChange(parsePaceMmSs(displayValue))}
    placeholder="mm:ss"
  />
  <Text className="text-xs text-muted-foreground">/km</Text>
</View>
```

### 4) Integer stepper for session counts

```tsx
// apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx
<View className="flex-row items-center gap-2">
  <Button
    variant="outline"
    size="icon"
    onPress={() => setValue(Math.max(min, value - 1))}
  >
    <Text>-</Text>
  </Button>
  <Text className="min-w-10 text-center">{value}</Text>
  <Button
    variant="outline"
    size="icon"
    onPress={() => setValue(Math.min(max, value + 1))}
  >
    <Text>+</Text>
  </Button>
</View>
```

## Commands

Package checks after each phase:

```bash
pnpm --filter @repo/mobile check-types
pnpm --filter @repo/mobile test
```

Full verification before merge:

```bash
pnpm check-types && pnpm lint && pnpm test
```

## PR Slicing Recommendation

1. PR1: Feature flag + minimal flow shell (no behavior change)
2. PR2: Goal/availability steps + step validators
3. PR3: Review step + blocker card + create gating
4. PR4: Advanced section extraction/collapse
5. PR5: Inline target editor + forecast collapse + polish/tests

## Nice-to-Have Enhancements (Post-MVP)

1. Add step analytics events (`step_view`, `step_blocked`, `quick_fix_applied`, `create_success`).
2. Add "Recommended" pills for safe defaults in availability/session fields.
3. Add "Reset advanced to recommended" action for power users.
4. Add localized plain-language copy variants for novice vs advanced profile.
5. Add optimistic prefetch of suggestions before opening create route.

## Definition of Done

1. Minimal path is 3 steps and completable without advanced settings.
2. Advanced settings remain complete and hidden by default.
3. Blocking conflicts and error guidance are surfaced before create.
4. Payload and API contract behavior are unchanged.
5. Mobile checks/tests pass and QA script is fully green.
