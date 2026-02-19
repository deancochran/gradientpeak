# Implementation Plan: Context-First Training Plan Initialization Simplification

Date: 2026-02-16
Owner: Core planning + tRPC + mobile create flow
Status: Ready for execution
Depends on: `design.md` in this spec folder

## Execution Order

1. Phase 0: Baseline audit and invariants
2. Phase 1: Unified load-state bootstrap
3. Phase 2: Context-driven initialization defaults
4. Phase 3: UX simplification for standard creation
5. Phase 4: Orchestration and recompute simplification
6. Phase 5: Validation and rollout gates

## Phase Overview

| Phase | Objective                                  | Deliverable                                                |
| ----- | ------------------------------------------ | ---------------------------------------------------------- |
| 0     | Lock current behavior and acceptance bands | Fixtures + guardrail tests for init output                 |
| 1     | Unify CTL/ATL/TSB bootstrap                | Shared bootstrap module consumed by preview/create         |
| 2     | Promote context-derived defaults           | Baseline/constraints/caps seeded from context signals      |
| 3     | Reduce creation complexity                 | Standard mode defaults-first, advanced mode for raw tuning |
| 4     | Remove unnecessary init churn              | Suggestion/recompute trigger pruning + cleaner merge path  |
| 5     | Prove safety and quality                   | Determinism, safety, and regression gates                  |

## Phase 0 - Baseline Audit and Invariants

### Objectives

1. Record baseline initialization outputs across representative athlete profiles.
2. Define acceptable delta bands for initialization changes.
3. Confirm hard safety bounds are unchanged and test-protected.

### Technical Work

1. Add fixture matrix for none/sparse/rich history initialization cases.
2. Snapshot current suggestion payload and preview bootstrap values.
3. Define per-metric acceptance bands for planned changes.

### Exit Criteria

1. Baseline fixtures and acceptance bands are committed.
2. Safety cap bounds have explicit regression tests.

## Phase 1 - Unified Load-State Bootstrap

### Objectives

1. Replace synthetic ATL/TSB initialization with data-grounded bootstrap.
2. Ensure preview and create use identical bootstrap logic.
3. Keep deterministic behavior in sparse and no-data scenarios.

### Technical Work

1. Add `computeLoadBootstrapState` core utility module.
2. Build daily TSS series with zero-fill and recency-aware handling.
3. Return `starting_ctl`, `starting_atl`, `starting_tsb`, and confidence metadata.
4. Route preview/create initialization through this one bootstrap utility.

### Exit Criteria

1. No code path initializes with forced `ATL=CTL` unless explicit fallback mode.
2. Preview/create bootstrap parity is test-backed.

## Phase 2 - Context-Driven Initialization Defaults

### Objectives

1. Use context as the primary source for baseline and constraints initialization.
2. Keep cap defaults inferred from history/timeline demand, still bounded by hard safety limits.
3. Improve behavior-derived constraints from actual activity patterns.

### Technical Work

1. Use weekly load distribution to seed baseline range and midpoint.
2. Infer session ranges and preferred days from activity frequency distribution.
3. Infer max session duration from historical percentiles and availability clipping.
4. Thread improved defaults into `deriveCreationSuggestions` output.

### Exit Criteria

1. Context summary fields materially influence default initialization values.
2. No schema bound changes for safety cap limits.

## Phase 3 - UX Simplification for Standard Creation

### Objectives

1. Make initialization quality strong without requiring optimizer slider interaction.
2. Preserve coach/power-user control through an advanced mode.
3. Reduce visible complexity in standard creation flow.

### Technical Work

1. Add standard mode preset selection from context/timeline pressure.
2. Keep raw optimizer multipliers available only in advanced controls.
3. Ensure default state merges suggestions with lock behavior unchanged.

### Exit Criteria

1. Standard flow presents minimal controls with sensible defaults.
2. Advanced mode still supports explicit multiplier overrides.

## Phase 4 - Orchestration and Recompute Simplification

### Objectives

1. Reduce unnecessary suggestion recompute triggers.
2. Keep preview updates responsive and race-safe.
3. Simplify initialization merge semantics for maintainability.

### Technical Work

1. Remove calibration-only changes from suggestion recompute dependencies.
2. Keep preview recompute for projection-impacting fields only.
3. Consolidate merge path for suggestions/defaults and lock overrides.

### Exit Criteria

1. Suggestion requests are triggered only by context-relevant changes.
2. Preview race-safety behavior remains intact and tested.

## Phase 5 - Validation and Rollout Gates

### Objectives

1. Validate initialization quality improvements without safety regressions.
2. Ensure deterministic behavior for repeated identical inputs.
3. Verify mobile/core/trpc contract and behavior parity.

### Technical Work

1. Expand tests for bootstrap, context defaults, and lock merge behavior.
2. Run cross-package verification commands.
3. Document rollout checks and fallback strategy.

### Verification Commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/trpc check-types
pnpm --filter @repo/trpc test
pnpm --filter mobile check-types
pnpm --filter mobile test
pnpm check-types && pnpm lint && pnpm test
```

### Exit Criteria

1. Initialization behavior meets acceptance bands from Phase 0.
2. Hard safety bounds remain unchanged and enforced.
3. All verification commands pass.

## Definition of Done

1. Context-first initialization is the default path in preview/create.
2. CTL/ATL/TSB bootstrap logic is shared, deterministic, and test-backed.
3. Standard creation no longer depends on optimizer slider edits for quality results.
4. Advanced tuning remains available as optional override.
5. Suggestion/recompute orchestration is materially simpler and easier to maintain.
