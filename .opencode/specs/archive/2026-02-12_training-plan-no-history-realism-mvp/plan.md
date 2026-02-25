# Training Plan Creation Realism - Technical Plan

## Purpose

Improve training plan creation and configuration for no-history users by:

1. Evaluating users before meaningful preview/create to seed dynamic defaults.
2. Applying deterministic no-history projection anchors with sensible fallbacks.
3. Preserving existing safety semantics (ramp caps, recovery/taper behavior).
4. Reducing duplication between `@repo/core`, `@repo/trpc`, and mobile.

---

## Scope and Outcome

### In scope

- Pre-form evaluation + default seeding.
- No-history (`history_availability_state === "none"`) anchor floor logic.
- Availability clamp and conservative fallback ladder.
- Preview/create parity through shared core logic.
- Consolidation of high-risk duplicate logic (types + key helpers).

### Out of scope

- New user-facing controls.
- Changes to sparse/rich behavior.
- Changes to cap semantics.

---

## Guiding Technical Rules

1. **Core owns math:** fusion, anchors, clamp, and fallback rules live in `@repo/core`.
2. **API orchestrates:** `@repo/trpc` forwards and composes; no duplicate anchor math.
3. **Mobile renders:** mobile shows results and explanation cues; no local projection inference.
4. **Deterministic always:** missing signals degrade to conservative behavior, never to random or implicit behavior.

---

## Architecture Delta (Target)

```text
mobile create screen
  -> trpc.getCreationSuggestions (pre-form evaluation)
  -> user edits config/goals
  -> trpc.previewCreationConfig
       -> core.buildPreviewMinimalPlanFromForm
       -> core.resolveNoHistoryAnchor (only if history=none)
       -> core.projection calculations + caps/recovery
  -> trpc.createFromCreationConfig (same shared core flow)
```

---

## Implementation Plan by Workstream

## 1) Core: No-History Fusion + Fallback Engine

**Files**

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/trainingPlanPreview.ts`
- `packages/core/plan/index.ts`

### 1.1 Add shared no-history anchor resolver

Create a single orchestration function and keep helpers composable.

```ts
// packages/core/plan/projectionCalculations.ts
export interface NoHistoryAnchorResult {
  startCtl: number;
  startWeeklyTss: number;
  fitnessLevel: "weak" | "strong";
  confidence: "high" | "medium" | "low";
  reasons: string[];
  floorClampedByAvailability: boolean;
}

export function resolveNoHistoryAnchor(
  ctx: NoHistoryAnchorContext,
): NoHistoryAnchorResult {
  const evidence = collectNoHistoryEvidence(ctx);
  const { fitnessLevel, reasons } = determineNoHistoryFitnessLevel(evidence);
  const floor = deriveNoHistoryProjectionFloor(ctx.goalTier, fitnessLevel);
  const clamped = clampNoHistoryFloorByAvailability(
    floor,
    ctx.availability,
    ctx.intensityModel,
  );
  const confidence = mapFeasibilityToConfidence(
    classifyBuildTimeFeasibility(ctx.goalTier, ctx.weeksToEvent),
  );

  return {
    startCtl: clamped.startCtl,
    startWeeklyTss: clamped.startWeeklyTss,
    fitnessLevel,
    confidence,
    reasons,
    floorClampedByAvailability: clamped.wasClamped,
  };
}
```

### 1.2 Enforce deterministic fallback ladder

```ts
// packages/core/plan/projectionCalculations.ts
// Fallback rules (ordered)
// 1) uncertain signals => weak
// 2) missing availability => no clamp + reason token
// 3) missing intensity model => conservative baseline profile
```

### 1.3 Apply only for no-history users

```ts
// packages/core/plan/trainingPlanPreview.ts
const isNoHistory = contextSummary?.history_availability_state === "none";
const anchor = isNoHistory ? resolveNoHistoryAnchor(anchorContext) : undefined;

const startingCtl = isNoHistory
  ? (anchor?.startCtl ?? existingStartCtl)
  : existingStartCtl;
```

---

## 2) Core: Canonical Contracts (Type Consolidation)

**Files**

- `packages/core/plan/projectionTypes.ts` (new)
- `packages/core/plan/index.ts`
- `apps/mobile/components/training-plan/create/projection-chart-types.ts` (remove/replace)
- `packages/trpc/src/routers/training_plans.ts`

### 2.1 Create canonical projection payload types in core

```ts
// packages/core/plan/projectionTypes.ts
export interface ProjectionChartPayload {
  start_date: string;
  end_date: string;
  points: Array<{
    date: string;
    predicted_load_tss: number;
    predicted_fitness_ctl: number;
  }>;
  goal_markers: Array<{
    id: string;
    name: string;
    target_date: string;
    priority: number;
  }>;
  // ...microcycles, phases, optional no-history metadata
}
```

### 2.2 Consume shared types in mobile/trpc

```ts
// apps/mobile/components/training-plan/create/CreationProjectionChart.tsx
import type { ProjectionChartPayload } from "@repo/core";
```

```ts
// packages/trpc/src/routers/training_plans.ts
import type { ProjectionChartPayload } from "@repo/core";
```

---

## 3) API: Pre-Form Evaluation and Parity Enforcement

**File**

- `packages/trpc/src/routers/training_plans.ts`

### 3.1 Treat suggestions endpoint as required pre-form evaluation source

```ts
// packages/trpc/src/routers/training_plans.ts
const contextSummary = deriveCreationContext(contextSignals);
const suggestions = deriveCreationSuggestions({
  context: contextSummary,
  existing_values,
  locks,
});

return {
  ...suggestions,
  context_summary: contextSummary,
};
```

### 3.2 Ensure preview/create both call shared core flow

```ts
// packages/trpc/src/routers/training_plans.ts
const previewPayload = buildPreviewMinimalPlanFromForm({
  formInput,
  creationConfig,
  contextSummary,
});
// same builder path used in createFromCreationConfig
```

---

## 4) Mobile: Dynamic Defaults + UX Explainability

**Files**

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`

### 4.1 Seed config from evaluated suggestions; fallback non-blocking

```ts
// apps/mobile/app/(internal)/(standard)/training-plan-create.tsx
const { data: creationSuggestions } = trpc.trainingPlans.getCreationSuggestions.useQuery(...);

const resolvedConfig = creationSuggestions
  ? mapSuggestionsToFormConfig(creationSuggestions)
  : conservativeLocalFallbackConfig;
```

### 4.2 Show concise no-history explanation cues

```tsx
// apps/mobile/components/training-plan/create/SinglePageForm.tsx
{
  projectionChart?.no_history?.floor_clamped_by_availability ? (
    <Text className="text-xs text-amber-700">
      Start floor adjusted to match your current availability.
    </Text>
  ) : null;
}
```

---

## 5) Consolidation: Remove High-Value Duplication

## 5.1 Shared availability-day helper

**Files**

- `packages/core/plan/availabilityUtils.ts` (new)
- Consumers in core/trpc/mobile

```ts
// packages/core/plan/availabilityUtils.ts
export function countAvailableTrainingDays(input: {
  availabilityDays: Array<{ day: string; windows: unknown[] }>;
  hardRestDays: string[];
}): number {
  const set = new Set(
    input.availabilityDays
      .filter((d) => d.windows.length > 0)
      .map((d) => d.day),
  );
  input.hardRestDays.forEach((d) => set.delete(d));
  return set.size;
}
```

## 5.2 Shared date-only UTC helpers

**Files**

- `packages/core/plan/dateOnlyUtc.ts` (new)
- Replace local duplicates where semantics match

```ts
// packages/core/plan/dateOnlyUtc.ts
export const parseDateOnlyUtc = (date: string) =>
  new Date(`${date}T00:00:00.000Z`);
export const formatDateOnlyUtc = (date: Date) =>
  date.toISOString().slice(0, 10);
```

---

## 6) Testing Plan

**Core tests**

- `packages/core/plan/__tests__/projection-calculations.test.ts`
- `packages/core/plan/__tests__/training-plan-preview.test.ts`

### Must-have test cases

1. No-history gate: floor logic only for `none`.
2. Canonical invariant: `weekly_tss = round(7 * ctl)`.
3. Availability clamp applies and emits flag.
4. Fallback determinism: uncertain evidence -> `weak`.
5. Preview/create parity for projection + metadata.
6. Safety regression checks: ramp caps and recovery/taper unchanged.

---

## 7) Rollout Sequence (Low Risk)

1. **Core engine first:** add resolver + tests.
2. **Type consolidation:** canonical payload types in core; adopt in trpc/mobile.
3. **API parity check:** verify preview/create use same core builder.
4. **Mobile UX cues:** add concise explanation messaging.
5. **Cleanup pass:** remove duplicate helpers where parity is verified.

---

## 8) Developer Simplicity Checklist

- One owner for anchor math (`@repo/core`).
- One projection payload contract (core-exported).
- One fallback ladder (documented + tested).
- One parity path for preview/create.
- Keep UI changes informative, not configurable.

---

## 9) Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core exec vitest run plan/__tests__/projection-calculations.test.ts
pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts
pnpm --filter mobile check-types
```

---

## 10) Definition of Done

1. No-history users receive realistic starting anchors with sensible fallbacks.
2. Preview and create return matching projection behavior and metadata.
3. Mobile surfaces clear, concise explanation cues for fallback/clamp outcomes.
4. Core/trpc/mobile duplication is reduced in canonical contracts and key helper logic.
5. Safety constraints remain unchanged and verified by tests.
