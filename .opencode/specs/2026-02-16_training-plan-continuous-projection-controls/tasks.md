# Tasks: Continuous Projection Controls and User Autonomy

Date: 2026-02-16
Spec: `.opencode/specs/2026-02-16_training-plan-continuous-projection-controls/`

## Dependency Notes

- Execution order is strict: **Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5**.
- Hard safety bounds remain non-negotiable (`max_weekly_tss_ramp_pct` in `[0,20]`, `max_ctl_ramp_per_week` in `[0,8]`).
- `@repo/core` remains canonical for optimization math and objective scoring.
- Mobile UX scope is constrained: add sliders to existing UI only; no new cards, tabs, collapsible sections, or complex multi-step UX.
- Anti-drift checklist in `rollout-checklist.md` is mandatory before merge.

## Current Status Snapshot

- [ ] Phase 0 complete
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete

## Phase 0 - Baseline and Invariants

### Checklist

- [ ] (owner: core+qa) Build fixture matrix covering sparse/rich history and low/medium/high demand contexts.
- [ ] (owner: core+qa) Snapshot baseline projections for current optimization profiles.
- [ ] (owner: core+qa) Add regression tests for hard cap bounds and deterministic tie-break behavior.
- [ ] (owner: spec+qa) Document monotonicity expectations for ambition/risk/curvature controls.

### Test Commands

- [ ] `cd packages/core && pnpm check-types && pnpm test -- projection-calculations projection-mpc-modules`

## Phase 1 - Contract and State Model

Depends on: **Phase 0 complete**

### Checklist

- [ ] (owner: core) Add `projection_control_v2` schema and parser defaults.
- [ ] (owner: core) Add ownership map schema for user-owned fields.
- [ ] (owner: trpc) Thread new contract fields through preview/create request normalization.
- [ ] (owner: mobile) Add local state support for control values + ownership map.
- [ ] (owner: qa) Add backward-compat tests for payloads without `projection_control_v2`.

### Test Commands

- [ ] `cd packages/core && pnpm test -- training-plan-creation-contracts`
- [ ] `cd packages/trpc && pnpm test -- training-plans`

## Phase 2 - Core Mapping and Objective Extension

Depends on: **Phase 1 complete**

### Checklist

- [ ] (owner: core) Implement effective mapping utility from semantic controls to optimizer/cap/search values.
- [ ] (owner: core) Add curvature envelope and curvature penalty term to objective evaluation.
- [ ] (owner: core) Integrate effective mapping into projection calculation path.
- [ ] (owner: core+qa) Add monotonicity tests (ambition/risk) and curvature polarity tests (-1/0/+1).
- [ ] (owner: core+qa) Add bounds tests to assert effective values remain within schema and profile limits.

### Test Commands

- [ ] `cd packages/core && pnpm check-types && pnpm test -- projection-calculations phase4-stabilization projection-mpc-modules`

## Phase 3 - Mobile Controls and Reset UX

Depends on: **Phase 2 complete**

### Checklist

- [ ] (owner: mobile) Add simple controls for ambition, risk tolerance, curvature, and curvature strength.
- [ ] (owner: mobile) Add simple/advanced mode switch with advanced direct tuning preserved in existing section layout.
- [ ] (owner: mobile) Mark user-owned fields on interaction and persist ownership state.
- [ ] (owner: mobile) Implement three reset actions (basic, advanced, all) with scoped ownership clearing.
- [ ] (owner: mobile) Implement controls by extending current `SinglePageForm` sections only (no new cards/components/tabs/collapsibles).
- [ ] (owner: qa) Perform UI topology audit confirming no new tabs/cards/collapsible/route-level create components.
- [ ] (owner: mobile+qa) Add interaction tests for ownership persistence across profile changes and suggestion refresh.

### Test Commands

- [ ] `cd apps/mobile && pnpm check-types && pnpm test -- SinglePageForm training-plan-create`

## Phase 4 - Diagnostics and Explainability

Depends on: **Phase 3 complete**

### Checklist

- [ ] (owner: core+trpc) Add `effective_optimizer_config` and objective contribution diagnostics to preview payload.
- [ ] (owner: mobile) Surface effective values and top binding constraints in review/projection UI.
- [ ] (owner: mobile) Add plain-language explanation strings for clamp and objective behavior.
- [ ] (owner: qa) Add tests asserting diagnostics are present and rendered when available.

### Test Commands

- [ ] `cd packages/trpc && pnpm test -- training-plans`
- [ ] `cd apps/mobile && pnpm test -- CreationProjectionChart SinglePageForm.blockers`

## Phase 5 - Validation and Rollout Readiness

Depends on: **Phase 4 complete**

### Checklist

- [ ] (owner: core+trpc+mobile) Run full check-types and test suites.
- [ ] (owner: qa) Validate deterministic projection results for repeated identical input snapshots.
- [ ] (owner: qa) Validate rapid slider-change race safety and last-write-wins behavior.
- [ ] (owner: spec) Add rollout checklist with feature-flag fallback notes.
- [ ] (owner: spec+qa) Verify acceptance criteria in design.md are met end-to-end.
- [ ] (owner: qa) Complete anti-drift checklist and attach completed checklist to implementation PR.

### Test Commands

- [ ] `cd packages/core && pnpm check-types && pnpm test`
- [ ] `cd packages/trpc && pnpm check-types && pnpm test`
- [ ] `cd apps/mobile && pnpm check-types && pnpm test`
- [ ] `cd /home/deancochran/GradientPeak && pnpm check-types && pnpm lint && pnpm test`

## Definition of Done

- [ ] Continuous controls are available and projection updates are deterministic.
- [ ] Curvature control measurably changes trajectory shape tendency.
- [ ] Defaults remain sensible with no required manual tuning.
- [ ] User ownership and reset semantics provide full autonomy.
- [ ] Effective optimizer diagnostics are exposed and test-verified.
- [ ] UI enhancements are delivered through added sliders in the current create UI with no structural UX expansion.
