# Implementation Plan: Single-Mode Capacity-Envelope Planning

Date: 2026-02-15
Owner: Core planning + API + mobile create flow
Status: Completed (Phase 0-7 complete)
Depends on: `design.md` in this spec folder

## Execution Order

1. Phase 0: Contract migration scaffolding
2. Phase 1: Core scoring/model consolidation
3. Phase 2: API and persistence migration
4. Phase 3: Mobile/web UX migration
5. Phase 4: Hard cutoff and release stabilization
6. Phase 5: Readiness coherence and visual truth alignment
7. Phase 6: Safety-first optimizer objective hardening
8. Phase 7: Schema governance and maintainability cleanup

No phase starts until prior phase exit criteria are green.

## Phase Overview

| Phase | Objective                                                                             | Depends on | Deliverable                                                                    |
| ----- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| 0     | Introduce single-mode contracts while tolerating legacy input briefly                 | none       | Core/trpc accept new shape and mark legacy fields deprecated                   |
| 1     | Implement single readiness metric with envelope realism                               | Phase 0    | Deterministic core readiness pipeline in production path                       |
| 2     | Remove mode/override persistence and API output fields                                | Phase 1    | Preview/create contracts reflect single-mode only                              |
| 3     | Remove mode/ack UX and align displays to single readiness                             | Phase 2    | Create flow with constraint editing, no acknowledgement gate                   |
| 4     | Enforce hard validation cutoff + release gates                                        | Phase 3    | Production-ready single-mode rollout                                           |
| 5     | Eliminate readiness headline-vs-curve mismatch and improve projection visual fidelity | Phase 4    | Coherent readiness timeline and chart behavior aligned with final readiness    |
| 6     | Enforce safest-default objective that maximizes highest achievable preparedness       | Phase 5    | Safety-first optimization policy in default path with explicit post-init risk  |
| 7     | Reduce schema/contract drift and maintenance complexity                               | Phase 6    | Canonical contract boundaries and reduced inferred/duplicative input semantics |

## Current Implementation Snapshot

Completed in codebase:

1. Single-mode hard cutoff and removal of mode/risk/ack contracts across core/trpc/mobile.
2. Single readiness headline with readiness confidence and capacity-envelope metadata in projection outputs.
3. Create-flow UI cleanup (no mode selector, no risk acknowledgement gate).
4. Phase-4 stabilization matrix and latency guardrails passing.
5. Contract cleanup for inferred duplicate input alias: `recent_influence_score` replaced by canonical `recent_influence.influence_score` path in core/trpc/mobile.
6. Phase-5 readiness coherence delivery: canonical `display_points` contract, cross-layer readiness coherence tests, and mobile consumption without local synthetic chart reshaping.
7. Phase-6 safety-first objective hardening: preparedness-first optimizer objective, hard-constraint preservation, and infeasible-goal best-safe progression behavior.
8. Phase-7 schema governance hardening: strict boundary parsing against inferred aliases, adapter/write-boundary regression coverage, and schema release-gate artifact.

Remaining gaps this follow-on plan addresses:

1. None. Follow-on phases are complete and verified by cross-layer test matrix.

## Phase 0 - Contract Migration Scaffolding

### Objectives

1. Define target schema without mode/risk contracts.
2. Add temporary legacy-field detection for controlled migration.
3. Keep deterministic canonicalization unchanged.

### Technical Work

1. Core schema updates
   - Update `packages/core/schemas/training_plan_structure.ts`:
     - remove `mode`, `risk_acceptance`, `constraint_policy` from active schema,
     - add optional migration parser for legacy fields with deprecation code emission.
2. Core type updates
   - Update `packages/core/plan/projectionTypes.ts`:
     - remove `mode_applied`, `overrides_applied`,
     - add `readiness_confidence` and `capacity_envelope` contract.
3. Canonicalization
   - Keep goal/target canonical sort and rounding policy as-is.

### Risks and Mitigations

1. Legacy clients break immediately -> temporary tolerance window plus explicit warnings.
2. Contract drift across packages -> core-exported types only; no local redefinition.

### Exit Criteria

1. New single-mode payloads validate across core/trpc.
2. Legacy payloads are accepted only via migration parser and emit deprecation code.
3. Type checks pass in core/trpc/mobile.

## Phase 1 - Single Readiness + Capacity Envelope Integration

### Objectives

1. Produce one readiness score as sole headline metric.
2. Integrate profile/history-aware envelope realism directly into readiness.
3. Preserve CTL/ATL/TSB as training-state metrics only.

### Technical Work

1. Readiness pipeline
   - Add/extend `packages/core/plan/projection/readiness.ts`:
     - compute `target_attainment_score`, `envelope_score`, `durability_score`, `evidence_score`,
     - compute single `readiness_score` and `readiness_confidence`.
2. Envelope model
   - Add `packages/core/plan/projection/capacity-envelope.ts`:
     - compute `safe_low/high` and `ramp_limit` from profile/history,
     - compute weekly envelope penalties and final `envelope_score`.
3. Projection wiring
   - Update `packages/core/plan/projectionCalculations.ts`:
     - replace multi-readiness output branching,
     - include `capacity_envelope` metadata and rationale codes.
4. CTL/ATL/TSB semantics guard
   - ensure no suitability classification path exists in core outputs.

### Risks and Mitigations

1. Score calibration drift -> lock constants with fixtures and golden tests.
2. Performance impact from envelope computation -> bounded weekly operations and cached context.

### Exit Criteria

1. Only one readiness headline metric exists in core projection output.
2. Envelope penalties measurably influence readiness in unrealistic scenarios.
3. Determinism/property tests pass for readiness and envelope components.

## Phase 2 - API and Persistence Migration

### Objectives

1. Remove mode/acknowledgement/override fields from preview/create contracts.
2. Stop persistence of override acceptance and override-policy metadata.
3. Keep backward readability of historical records.

### Technical Work

1. tRPC contract updates
   - Update `packages/trpc/src/routers/training-plans.base.ts` and use cases:
     - remove mode/risk validation branch,
     - pass through single readiness and envelope metadata.
2. Persistence updates
   - Update training plan create persistence pipeline:
     - stop writing acceptance timestamps/reasons,
     - stop writing override-policy blobs.
3. Migration toggles
   - Add bounded feature flag for legacy input acceptance cutoff.

### Risks and Mitigations

1. Analytics/report consumers expect override fields -> provide migration note and null-safe readers.
2. Snapshot token divergence -> canonical payload tests before cutoff.

### Exit Criteria

1. Preview/create API no longer emits mode/override fields.
2. New plans persist no override metadata.
3. Historical plans remain readable without reprocessing.

## Phase 3 - UX Migration (Create/Review)

### Objectives

1. Remove mode selector and acknowledgement UI.
2. Keep editable constraints and targets available.
3. Present one readiness metric plus envelope/training-state diagnostics.

### Technical Work

1. Mobile create form
   - Update `apps/mobile/components/training-plan/create/SinglePageForm.tsx`:
     - remove mode selector and acknowledgement gate,
     - keep constraints section always accessible.
2. Review/projection UI
   - Update `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`:
     - display single readiness score + confidence,
     - display envelope state/limiting factors,
     - show CTL/ATL/TSB in training-state section with non-suitability copy.
3. Client adapters/validation
   - Update `apps/mobile/lib/training-plan-form/adapters/creationConfig.ts` and `validation.ts` to remove legacy fields.

### Risks and Mitigations

1. Users lose perceived control without mode toggle -> clearer advanced constraints controls.
2. UI clutter from diagnostics -> progressive disclosure defaults.

### Exit Criteria

1. No mode/acknowledgement controls remain.
2. User can freely edit constraints/load/targets.
3. Readiness display is single-line headline with supporting diagnostics.

## Phase 4 - Hard Cutoff and Release Stabilization

### Objectives

1. End migration tolerance for legacy mode/risk payloads.
2. Verify release gates and production stability.

### Technical Work

1. Validation cutoff
   - remove legacy parser path and enforce hard schema rejection for removed fields.
2. Test completion
   - run full unit/property/golden/integration matrix.
3. Operational checks
   - confirm p95 latency and error budgets are unchanged or improved.

### Exit Criteria

1. Legacy mode/risk fields are rejected server-side.
2. Release gates in design doc are all green.
3. Rollout checklist approved by core + API + mobile owners.

## Phase 5 - Readiness Coherence + Visual Truth Alignment

### Objectives

1. Ensure projected readiness curve behavior is consistent with final readiness semantics.
2. Remove avoidable chart-side distortion and preserve model intent in visualization.
3. Keep one readiness headline while improving user understanding of prepare/train/rest/recover progression.

### Technical Work

1. Readiness pipeline coherence
   - Refactor readiness orchestration in `packages/core/plan/projectionCalculations.ts` and `packages/core/plan/projection/readiness.ts` so stage semantics are explicit and non-overwriting.
   - Preserve deterministic computation while exposing a single final curve source for display.
2. Chart contract alignment
   - Reduce client-side reshaping in `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`.
   - Favor server/core-provided display-ready points where feasible to avoid local divergence.
3. Coherence tests
   - Add cross-layer readiness coherence tests (core -> trpc -> mobile fixture path).

### What This Brings

1. Users see a readiness curve that better reflects actual projected preparedness trajectory.
2. Reduced confusion when goals are difficult or infeasible.
3. Lower maintenance risk from duplicated chart logic.

### Exit Criteria

1. No headline-vs-curve contradiction in supported fixtures.
2. Preview/create parity remains intact for readiness timeline and diagnostics.
3. Determinism and latency guardrails remain green.

## Phase 6 - Safety-First Objective Hardening

### Objectives

1. Make default planner behavior explicitly maximize highest safely achievable preparedness toward `readiness_score = 100`.
2. Preserve hard safety constraints in default path.
3. Keep higher-risk progression available only via explicit post-initialization customization.

### Technical Work

1. Objective semantics
   - Update objective composition in `packages/core/plan/projectionCalculations.ts` / MPC path so preparedness gain dominates secondary penalties.
2. Safety constraints
   - Keep ramp/CTL/recovery limits as hard constraints; no default-path bypass.
3. Explainability
   - Ensure feasibility/rationale outputs explain why full 100 readiness may not be reachable in timeframe.

### What This Brings

1. Safer default plans that still push to best achievable performance.
2. Clear user trust model: default protects athlete; custom edits can intentionally trade risk.

### Exit Criteria

1. Objective behavior verified by tests: maximize safe achievable readiness under constraints.
2. Hard safety constraints never violated by default optimizer.
3. Infeasible goals still produce best safe plan instead of hard create blocking.

## Phase 7 - Schema Governance + Maintainability Cleanup

### Objectives

1. Prevent reintroduction of derivable/inferred duplicate fields.
2. Reduce cross-layer schema drift and maintenance overhead.
3. Strengthen canonical contract boundaries for core -> trpc -> mobile.

### Technical Work

1. Canonical schema enforcement
   - Keep only canonical object forms in contracts (example already applied: `recent_influence`).
2. Drift reduction
   - Consolidate duplicated type surfaces where low-risk.
   - Add contract tests that validate write/read and adapter parity.
3. Governance
   - Add release-gate checklist for schema changes (classification, fixtures, cross-layer tests).

### What This Brings

1. Faster safer iteration on readiness/projection without contract regressions.
2. Lower cognitive load for future maintenance.

### Exit Criteria

1. No duplicate inferred aliases in active creation/projection contracts.
2. Cross-layer contract fixtures pass across core/trpc/mobile.
3. Schema-change governance checklist adopted in this spec tasks.

## Dependency Graph

```text
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7
```

## Backout Strategy

1. If readiness calibration regresses, revert to previous readiness constants while staying single-mode.
2. If legacy-client traffic remains high at cutoff, extend parser window without reintroducing mode UX/contracts.
3. If envelope compute costs regress, disable non-critical diagnostics but keep readiness and realism penalties active.

## Definition of Done

1. Mode/risk/acknowledgement contracts are removed end-to-end.
2. No override metadata is persisted or reported for new plans.
3. One readiness score is the sole readiness headline and includes envelope realism.
4. CTL/ATL/TSB are retained only as training-state metrics without suitability semantics.
5. Determinism, correctness, and latency gates pass for preview/create.
6. Default objective is safety-first while maximizing highest achievable preparedness.
7. Readiness visualization is coherent with projection semantics and contract outputs.
8. Active schema/contracts avoid derivable duplicate fields and pass cross-layer governance checks.
