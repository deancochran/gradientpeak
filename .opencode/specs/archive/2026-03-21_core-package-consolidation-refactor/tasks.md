# Tasks: Core Package Consolidation Refactor

## Coordination Rules

- [ ] `@repo/core` remains database-independent and platform-safe throughout the refactor.
- [ ] A task is complete only when code lands and focused validation passes.
- [ ] Legacy files may remain during migration, but they must become compatibility facades rather than source owners.
- [ ] Any formula or heuristic change caused by consolidation must be called out explicitly in code review notes or task progress.

## Completed Summary

- [x] Phases 1-8 are complete: the spec is locked, canonical load modules own load math, main replay callers are cut over, sport heuristics now route through the shared sport registry, a dedicated baseline-override replay fixture protects the home/trends path before further caller cutovers, canonical duration helpers own structured duration policy, zones plus baseline estimators route through shared core modules, goal parsing/payload rules now live under canonical core goal modules, and constants plus compatibility barrels are split into narrower domain ownership.

## Phase 5: Duration Canonicalization

- [x] Task K - Create canonical duration helpers. Success: `packages/core/duration/` owns duration-to-seconds, totals, and duration formatting policy.
  - Completion note: added `packages/core/duration/{seconds,format,totals,index}.ts` and package subpath export `@repo/core/duration`.
- [x] Task L - Redirect duplicate duration callers. Success: `calculations_v2.ts`, `schemas/duration_helpers.ts`, and estimation helpers consume the canonical duration module.
  - Cutover note: `packages/core/estimation/strategies.ts` now uses the canonical duration engine directly; `packages/core/calculations_v2.ts` and `packages/core/schemas/duration_helpers.ts` now delegate to the same shared policy.
- [x] Task M - Resolve policy differences explicitly. Success: the codebase documents and tests the chosen defaults for repetitions, distance estimation, and `untilFinished`.
  - Policy note: canonical duration estimation now resolves `distance`, `repetitions`, and `untilFinished` through sport-registry defaults, with explicit caller overrides still allowed.
  - Validation note: `pnpm --filter "@repo/core" check-types` and `pnpm exec vitest run duration/__tests__/duration.test.ts load/__tests__/replay.baseline-override.test.ts sports/__tests__/registry.test.ts` pass.

## Phase 6: Zones And Metric Estimation Consolidation

- [x] Task N - Create canonical zones modules. Success: HR, power, and intensity zones are defined once and exported for analytics and UI use.
  - Completion note: added `packages/core/zones/{definitions,hr,power,intensity,index}.ts` and routed HR/power/intensity callers onto shared zone helpers.
- [x] Task O - Consolidate onboarding and threshold estimators. Success: overlapping logic in `estimation/defaults.ts`, `calculations/performance-estimates.ts`, and `calculations/heart-rate.ts` routes through one canonical source.
  - Completion note: added `packages/core/estimators/{onboarding,recent-activity,types,index}.ts` and converted legacy estimation surfaces into compatibility facades.
- [x] Task P - Cut app hardcoded zone and estimator logic over to core. Success: mobile onboarding and other callers stop hardcoding duplicated threshold or zone rules.
  - Cutover note: shared exports now live under `@repo/core/duration`, `@repo/core/zones`, and `@repo/core/estimators`, with root namespaces exposed for callers to migrate onto.

## Phase 7: Goal Parsing And Validation Extraction

- [x] Task Q - Create canonical goal parsing and payload modules in core. Success: reusable target parsers, payload builders, and summary helpers live under `packages/core/goals/`.
  - Completion note: added canonical `packages/core/goals/parse.ts` and `packages/core/goals/format.ts` module surfaces over the existing goal parser/formatter ownership, while `goalDraft.ts` remains a compatibility facade.
- [x] Task R - Reduce mobile goal creation code to thin adapters. Success: `apps/mobile/lib/goals/goalDraft.ts` consumes core payload/parsing helpers rather than owning domain rules.
  - Completion note: there is no remaining mobile-local `goalDraft.ts`; mobile goal screens already consume shared core goal helpers, so this phase formalized the canonical module split without needing a new mobile adapter file.
- [x] Task S - Align training-plan form validation with core goal rules. Success: `apps/mobile/lib/training-plan-form/validation.ts` uses shared parsing/validation helpers where possible.
  - Completion note: `apps/mobile/lib/training-plan-form/validation.ts` now delegates schema validation and field error construction to `@repo/core` goal validation exports instead of maintaining a local duplicate schema.

## Phase 8: Constants Split And Legacy Cleanup

- [x] Task T - Split mixed constants into focused modules. Success: `packages/core/constants.ts` no longer acts as the single mixed source for unrelated domains.
  - Completion note: split constants into `packages/core/constants/{activity,training,zones,system,ble,index}.ts` and kept `packages/core/constants.ts` as a compatibility facade.
- [x] Task U - Reduce barrel ambiguity in `packages/core/index.ts`. Success: exports reflect canonical domain ownership and minimize duplicate/conflicting names.
  - Completion note: package exports now expose canonical `@repo/core/constants`, `@repo/core/duration`, `@repo/core/zones`, and `@repo/core/goals` subpaths, while `calculations.ts` and `calculations_v2.ts` are explicitly labeled compatibility layers.
- [x] Task V - Remove or quarantine dead files after reference verification. Success: orphaned files such as `packages/core/test-schema.ts` are either deleted or explicitly marked as non-runtime fixtures.
  - Completion note: deleted unreferenced `packages/core/test-schema.ts` after confirming no runtime or test callers remained.

## Validation Gate

- [x] Validation 1-2 - `@repo/core` typechecks and focused canonical-domain tests pass.
- [x] Validation 3 - `@repo/trpc` typechecks and focused router tests pass.
- [x] Validation 4 - `mobile` typechecks after caller cutovers.
- [ ] Validation 5 - final monorepo validation passes before handoff or commit.
