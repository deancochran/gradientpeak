# Tasks: Theoretical Capacity Frontier

Date: 2026-02-16
Spec: `.opencode/specs/2026-02-16_training-plan-theoretical-capacity-frontier/`

## Dependency Notes

1. Execute in order: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5**.
2. Keep safe defaults for non-elite/no-history users.
3. Keep one reset button in tuning UX.
4. No create-flow topology expansion (no tabs/cards/collapsible/wizard additions).

## Current Status Snapshot

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [x] Phase 4 complete
- [x] Phase 5 complete

## Phase 0 - Baseline and Guardrails

### Checklist

- [x] (owner: core+qa) Add baseline fixture snapshots for no-history default users.
- [x] (owner: core+qa) Add benchmark fixture matrix for professional, ultra, and theoretical scenarios.
- [x] (owner: core+qa) Add determinism checks for each fixture class.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test -- projection-calculations projection-parity-fixtures`

## Phase 1 - Cap Architecture Separation

Depends on: **Phase 0 complete**

### Checklist

- [x] (owner: core) Separate conservative default caps from absolute engine rails.
- [x] (owner: core) Keep default no-history behavior unchanged.
- [x] (owner: qa) Add tests proving defaults are unchanged while high override inputs are accepted.

### Test Commands

- [x] `cd packages/core && pnpm test -- projection-safety-caps projection-calculations`

## Phase 2 - Frontier Mapping and Solver Integration

Depends on: **Phase 1 complete**

### Checklist

- [x] (owner: core) Audit and align cap/limit usage in all projection paths (objective, fallback, tie-break).
- [x] (owner: core) Remove hidden fixed-ceiling behavior where present.
- [x] (owner: core+qa) Add monotonic frontier tests (higher overrides increase reachable upper band).
- [x] (owner: core+qa) Add no-hidden-cap regression tests.

### Test Commands

- [x] `cd packages/core && pnpm test -- projection-calculations projection-mpc-modules phase4-stabilization`

## Phase 3 - UX and Slider Range Alignment

Depends on: **Phase 2 complete**

### Checklist

- [x] (owner: mobile) Verify slider ranges support elite and theoretical override scenarios.
- [x] (owner: mobile) Keep exactly one reset action in tuning header.
- [x] (owner: mobile+qa) Add interaction tests proving user can set frontier-level values in existing UI.
- [x] (owner: qa) Confirm no topology drift (no new tabs/cards/collapsible/wizard components).

### Test Commands

- [x] `cd apps/mobile && pnpm check-types && pnpm test -- SinglePageForm.blockers training-plan-create`

## Phase 4 - Diagnostics and Stress-Test Visibility

Depends on: **Phase 3 complete**

### Checklist

- [x] (owner: core+trpc) Ensure extreme runs expose effective config and clamp/objective diagnostics.
- [x] (owner: mobile) Surface plain-language sustainability and extreme-load signals in existing review panels.
- [x] (owner: qa) Add tests for diagnostics visibility under theoretical scenarios.

### Test Commands

- [x] `cd packages/trpc && pnpm test -- training-plans`
- [x] `cd apps/mobile && pnpm test -- CreationProjectionChart.metadata SinglePageForm.blockers`

## Phase 5 - Benchmark and Theoretical Validation

Depends on: **Phase 4 complete**

### Checklist

- [x] (owner: core+qa) Add benchmark-aligned assertions for professional range scenarios.
- [x] (owner: core+qa) Add benchmark-aligned assertions for ultra-range scenarios.
- [x] (owner: core+qa) Add theoretical stress scenarios above benchmark ranges and assert stability.
- [x] (owner: core+trpc+mobile) Run full checks and ensure no regressions.
- [x] (owner: spec+qa) Verify design acceptance criteria end-to-end.

### Test Commands

- [x] `cd packages/core && pnpm check-types && pnpm test`
- [x] `cd packages/trpc && pnpm check-types && pnpm test`
- [x] `cd apps/mobile && pnpm check-types && pnpm test`
- [x] `cd /home/deancochran/GradientPeak && pnpm check-types && pnpm lint && pnpm test`

## Definition of Done

- [x] Safe defaults remain conservative for normal/no-history users.
- [x] User overrides can produce elite and theoretical projection ranges.
- [x] Extreme projections are diagnosable and deterministic.
- [x] No fixed "human maximum" is used as a hard blocker.
- [x] Create flow remains structurally unchanged.
