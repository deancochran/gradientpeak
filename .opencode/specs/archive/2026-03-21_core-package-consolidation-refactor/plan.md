# Implementation Plan: Core Package Consolidation Refactor

## 1. Strategy

Refactor by domain slice, not by file count. Extract canonical modules with tests first, migrate internal core consumers second, migrate app and tRPC consumers third, and convert legacy files into compatibility facades before deleting dead code.

## 2. Planned File Areas

### Core canonical modules

- `packages/core/load/**`
- `packages/core/sports/**`
- `packages/core/zones/**`
- `packages/core/duration/**`
- `packages/core/goals/**`
- `packages/core/constants/**`

### Core compatibility and migration surfaces

- `packages/core/calculations.ts`
- `packages/core/calculations_v2.ts`
- `packages/core/index.ts`
- `packages/core/estimation/**`
- `packages/core/utils/activity-defaults.ts`
- `packages/core/utils/fitness-inputs.ts`
- `packages/core/plan/**`

### Callers to migrate

- `packages/trpc/src/routers/home.ts`
- `packages/trpc/src/routers/trends.ts`
- `apps/mobile/app/(external)/onboarding.tsx`
- `apps/mobile/lib/goals/goalDraft.ts`
- `apps/mobile/lib/training-plan-form/validation.ts`
- `apps/mobile/lib/constants/activities.ts`

## 3. Safe Extraction Order

### Phase 1: Lock canonical load ownership

Goal: define one shared source for TSS and training load progression before touching app callers.

Tasks:

- create `packages/core/load/tss.ts` and move canonical TSS-related formulas there,
- create `packages/core/load/progression.ts` for CTL, ATL, TSB, daily series, and projection helpers,
- create `packages/core/load/replay.ts` for date-keyed history replay helpers,
- create `packages/core/load/form.ts`, `ramp.ts`, and `workload.ts` for form/status, ramp, and workload-envelope helpers,
- add fixture tests that compare the extracted implementation against current expected behavior,
- update `packages/core/calculations.ts` and `packages/core/calculations/workload.ts` to delegate to these canonical modules instead of owning the formulas.

Safe-extraction notes:

- do not delete old exports yet,
- prefer wrapper forwarding over renaming imports in one step,
- define one canonical daily replay helper for date-keyed TSS histories.

### Phase 2: Cut tRPC load duplication over to core

Goal: remove manual day-by-day replay from server routers.

Tasks:

- replace duplicated CTL/ATL/TSB loops in `packages/trpc/src/routers/home.ts`,
- replace duplicated replay logic in `packages/trpc/src/routers/trends.ts`,
- move any reusable date-keyed history shaping into the new load module,
- verify behavior with focused router tests and representative fixtures.

Safe-extraction notes:

- preserve response shapes,
- keep router-specific query/persistence logic in tRPC,
- move only the calculation and replay logic to core.

### Phase 3: Extract sport registry and activity heuristics

Goal: centralize all per-activity defaults and load assumptions.

Tasks:

- create `packages/core/sports/contracts.ts` and `packages/core/sports/registry.ts`,
- extract run/bike/swim/strength/other definitions from `estimation/strategies.ts`, `estimation/metrics.ts`, and `utils/activity-defaults.ts`,
- expose small helpers like `getSportDefaults`, `getSportFallbackSpeed`, `getSportDefaultTarget`, and `getSportLoadHeuristics`,
- update existing estimation and default-step builders to consume the registry.

Safe-extraction notes:

- keep existing function signatures where practical,
- do not mix UI icons or class names into the registry,
- document any disagreements between existing heuristics before resolving them.

### Phase 4: Canonicalize duration interpretation

Goal: remove the three competing duration helper implementations.

Tasks:

- create `packages/core/duration/seconds.ts`, `format.ts`, and `totals.ts`,
- choose one explicit policy for estimating `distance`, `repetitions`, and `untilFinished`,
- source sport-aware defaults from the new sport registry,
- redirect `calculations_v2.ts`, `estimation/strategies.ts`, and `schemas/duration_helpers.ts` to the canonical helpers,
- add tests covering current V2 workout structures and edge cases.

Safe-extraction notes:

- treat differing defaults as a design decision, not an incidental cleanup,
- keep a compatibility wrapper in `schemas/duration_helpers.ts` until callers are migrated.

### Phase 5: Consolidate zones and threshold estimators

Goal: centralize zone boundaries and baseline metric estimation.

Tasks:

- create `packages/core/zones/{hr,power,intensity,definitions}.ts`,
- split numeric thresholds from label metadata,
- reconcile `estimation/defaults.ts`, `calculations/performance-estimates.ts`, and `calculations/heart-rate.ts` into one canonical metric-estimation surface,
- keep any richer result shapes as wrappers around canonical scalar calculators where needed.

Safe-extraction notes:

- keep UI consumers dependent on semantic metadata, not hardcoded boundaries,
- preserve public function names initially through delegating facades.

### Phase 6: Move goal parsing and validation into core

Goal: make goal payload building reusable across apps and server.

Tasks:

- create `packages/core/goals/parse.ts`, `payloads.ts`, and `format.ts`,
- move goal target parsing rules from mobile into core,
- move reusable validation guards and parsing helpers into goal-specific core modules,
- update `apps/mobile/lib/goals/goalDraft.ts` to become a thin consumer,
- update `apps/mobile/lib/training-plan-form/validation.ts` to delegate target validation logic where safe.

Safe-extraction notes:

- keep view-model shaping in mobile,
- move only canonical domain rules, parsers, and payload construction into core.

### Phase 7: Split constants and reduce barrel ambiguity

Goal: make the public surface easier to discover and safer to consume.

Tasks:

- split `packages/core/constants.ts` into focused constant modules,
- update imports to narrower sources,
- reduce `packages/core/index.ts` ambiguity by grouping exports by canonical domain,
- make `packages/core/calculations.ts` and `packages/core/calculations_v2.ts` explicit compatibility layers,
- identify and remove dead files such as `packages/core/test-schema.ts` only after reference verification.

Safe-extraction notes:

- avoid breaking package entrypoints in the first pass,
- remove deprecated exports only in a dedicated cleanup phase once all callers are migrated.

## 4. Sequencing Rules

- complete load extraction before migrating callers that replay load,
- complete sport registry extraction before canonicalizing duration defaults,
- complete duration extraction before removing V2 helper duplication,
- complete goal parser extraction before touching mobile goal forms broadly,
- delete legacy code only after wrappers are in place and callers are updated.

## 5. Testing And Verification Strategy

### Focused verification per phase

Phase 1-2:

```bash
pnpm --filter @repo/core test -- load
pnpm --filter @repo/trpc test -- home
pnpm --filter @repo/trpc test -- trends
```

Phase 3-5:

```bash
pnpm --filter @repo/core test -- estimation
pnpm --filter @repo/core test -- duration
pnpm --filter @repo/core test -- zones
```

Phase 6-7:

```bash
pnpm --filter @repo/core test -- goals
pnpm --filter mobile check-types
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/core check-types
```

Preferred final validation:

```bash
pnpm check-types && pnpm lint && pnpm test
```

## 6. Deliverable Expectations

By the end of the refactor:

- canonical domains exist and own their logic,
- old monolith files forward rather than calculate,
- mobile and tRPC consume core for domain logic,
- extraction order has preserved behavior and avoided broad breakage,
- cleanup candidates are documented for a follow-up deletion pass.
