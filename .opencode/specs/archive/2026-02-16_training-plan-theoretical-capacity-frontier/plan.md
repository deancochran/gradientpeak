# Implementation Plan: Theoretical Capacity Frontier

Date: 2026-02-16
Owner: Core optimization + mobile create UX + tRPC contracts
Status: Ready for execution
Depends on: `design.md` in this spec folder

## Execution Order

1. Phase 0: Baseline and guardrails
2. Phase 1: Cap architecture separation
3. Phase 2: Frontier mapping and solver integration
4. Phase 3: UX and slider range alignment
5. Phase 4: Diagnostics and stress-test visibility
6. Phase 5: Benchmark and theoretical validation

## UX Constraints

1. Keep current create flow topology.
2. Keep one tuning reset button.
3. No new tabs/cards/collapsible/wizard patterns.
4. Keep labels plain language.

## Phase 0 - Baseline and Guardrails

### Objectives

1. Freeze current default safety behavior as regression baseline.
2. Define benchmark fixtures for professional, ultra, and theoretical scenarios.

### Work

1. Snapshot default outputs for no-history and normal-history users.
2. Add fixture matrix for:
   - safe-default,
   - elite override,
   - ultra extreme,
   - theoretical stress.

### Exit Criteria

1. Baseline fixtures committed.
2. Determinism assertions exist for all fixture classes.

## Phase 1 - Cap Architecture Separation

### Objectives

1. Separate conservative defaults from high finite engine rails.
2. Ensure engine rails represent computational safety, not fixed human max beliefs.

### Work

1. Refactor safety-cap normalization into:
   - default cap values,
   - absolute engine rails.
2. Ensure current defaults remain unchanged for normal users.

### Exit Criteria

1. Default user behavior unchanged.
2. Engine can accept expanded override ranges without breaking.

## Phase 2 - Frontier Mapping and Solver Integration

### Objectives

1. Ensure user slider overrides propagate fully into effective optimizer behavior.
2. Remove hidden fixed ceiling behavior in solver path.

### Work

1. Audit and align ramp/CTL/search limit usage across objective and fallback paths.
2. Add no-hidden-cap tests for candidate generation and clamping path.
3. Preserve deterministic tie-break behavior.

### Exit Criteria

1. Increased overrides increase reachable frontier under same context.
2. No accidental hard ceiling regression remains.

## Phase 3 - UX and Slider Range Alignment

### Objectives

1. Keep safe defaults while allowing easy override to frontier ranges.
2. Preserve one-reset-button tuning UX.

### Work

1. Verify slider ranges support elite and theoretical scenarios.
2. Keep one reset action for tuning.
3. Validate no dropdown dependency for accessing key overrides.

### Exit Criteria

1. User can configure frontier-level plans directly from existing controls.
2. UI remains in-place with no topology expansion.

## Phase 4 - Diagnostics and Stress-Test Visibility

### Objectives

1. Explain why extreme plans are generated.
2. Explain when sustainability confidence is low.

### Work

1. Surface effective config, clamp pressure, objective composition, and envelope state.
2. Add plain-language labels for extreme/sustainability risk zones.

### Exit Criteria

1. Extreme outputs are transparent and interpretable.
2. Diagnostics are present in preview and tests.

## Phase 5 - Benchmark and Theoretical Validation

### Objectives

1. Prove default-safe behavior remains intact.
2. Prove frontier and theoretical capabilities are reachable when configured.

### Work

1. Add benchmark tests for:
   - 800-1200 professional range,
   - 1500-2200+ ultra range,
   - theoretical stress above benchmark ranges.
2. Run full package checks.

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

1. All validation passes.
2. Defaults are still safe.
3. Frontier and theoretical scenarios are achievable via explicit user configuration.

## Definition of Done

1. No default-user regression in safety-first behavior.
2. No fixed human-max blocker exists in projection architecture.
3. Elite/theoretical planning is possible through user overrides.
4. Extreme scenarios remain deterministic and numerically stable.
5. Existing create UI structure remains unchanged.
