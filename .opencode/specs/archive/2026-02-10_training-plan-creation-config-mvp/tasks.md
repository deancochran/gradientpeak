# Training Plan Creation Configuration MVP (Task Checklist)

Last Updated: 2026-02-10
Status: Ready for implementation
Owner: Mobile + Core + Backend

This checklist implements `./design.md` and `./plan.md` for the current create flow.

## Phase 1 - Core Contracts and Deterministic Logic

- [ ] Add creation-config schemas to `packages/core/schemas/training_plan_structure.ts` (availability, baseline load, recent influence, constraints, locks).
- [ ] Add provenance metadata schemas (`source`, `confidence`, `rationale`, `updated_at`) to `packages/core/schemas/form-schemas.ts` or shared schema location.
- [ ] Export new schemas/types from `packages/core/schemas/index.ts` and `packages/core/index.ts` as needed.
- [ ] Implement `packages/core/plan/normalizeCreationConfig.ts` to normalize raw form values.
- [ ] Implement `packages/core/plan/resolveConstraintConflicts.ts` with deterministic precedence rules.
- [ ] Implement `packages/core/plan/classifyCreationFeasibility.ts` with deterministic feasibility and safety outputs.
- [ ] Implement `packages/core/plan/deriveCreationContext.ts` using profile signals (completed activities, efforts, activity context, profile metrics).
- [ ] Implement `packages/core/plan/deriveCreationSuggestions.ts` for profile-aware prefills with confidence and drivers.
- [ ] Add no-data fallback path (conservative defaults + low confidence markers).
- [ ] Add rich-data path behavior (narrower ranges + higher confidence when evidence quality supports it).

## Phase 2 - tRPC Input, Preview, and Persistence

- [ ] Update create-time input contract in `packages/trpc/src/routers/training_plans.ts` to include config + provenance + lock metadata.
- [ ] Add/extend suggestion procedure in `packages/trpc/src/routers/training_plans.ts` for creation-context prefills.
- [ ] Add/extend pre-create preview procedure to return feasibility band, safety band, and top drivers.
- [ ] Ensure preview/create use core deterministic helpers (no duplicate business logic in router).
- [ ] Enforce hard rule: no autonomous post-create mutation behavior in MVP.
- [ ] Persist normalized final values and metadata with clear source-of-truth semantics.
- [ ] Return path-specific validation errors for invalid/conflicting inputs.
- [ ] Ensure locked fields are never overridden by suggested values at API boundary.

## Phase 3 - Mobile Create Form Enhancements (Current Flow)

- [ ] Enhance `apps/mobile/components/training-plan/create/SinglePageForm.tsx` with compact summary rows for the four config areas.
- [ ] Keep advanced configuration panels collapsed by default (progressive disclosure optional).
- [ ] Ensure minimal create path works without opening advanced panels.
- [ ] Add availability template panel (template select + optional day-level edits).
- [ ] Add baseline load panel (suggested + manual override).
- [ ] Add recent training influence panel with explicit actions (`accepted`, `edited`, `disabled`).
- [ ] Add constraints/locks panel (cap/floor, rest days, frequency bounds, max session duration).
- [ ] Add visible lock toggles and lock-state UI on lockable fields.
- [ ] Add source badges (`user`, `suggested`, `default`) for major configurable values.
- [ ] Add compact context banner summarizing suggestion basis with optional rationale view.
- [ ] Add pre-submit feasibility/safety readout panel showing `under-reaching`, `on-track`, `over-reaching` and `safe`, `caution`, `high-risk`.
- [ ] Add blocking conflict UI with clear corrective actions when configuration is invalid.

## Phase 4 - Mobile Screen Orchestration

- [ ] Update `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` to request profile-aware suggestions on screen load.
- [ ] Recompute suggestions only on high-impact input changes; never silently overwrite user-modified values.
- [ ] Respect lock state during recompute and show informational conflicts when applicable.
- [ ] Call preview endpoint before final create and block unresolved invalid states.
- [ ] Submit only user-confirmed final values with provenance and lock metadata.
- [ ] Preserve current submit UX contract (minimal overhead, clear top-level action).

## Phase 5 - Athlete Spectrum and Safety Validation

- [ ] Verify no-data beginner scenario produces conservative defaults and low-confidence suggestions.
- [ ] Verify sparse-data scenario produces usable suggestions with broader ranges.
- [ ] Verify rich-data advanced scenario produces tighter confidence-labeled suggestions.
- [ ] Verify suggestion generation tolerates missing profile fields and missing effort data.
- [ ] Verify feasibility/safety visuals are always available pre-create.
- [ ] Verify users can visually detect under-reaching vs over-reaching before submit.

## Phase 6 - Quality Gates

- [ ] Run `pnpm check-types` in `packages/core`.
- [ ] Run `pnpm check-types` in `packages/trpc`.
- [ ] Run `pnpm check-types` in `apps/mobile`.
- [ ] If requested or available, run focused tests for new core logic and router validation.
- [ ] Run full validation if feasible: `pnpm check-types && pnpm lint && pnpm test` at repo root.

## Phase 7 - Rollout Guardrails

- [ ] Gate feature behind `feature.trainingPlanCreateConfigMvp` (or agreed equivalent).
- [ ] Roll out staged: internal -> pilot cohort -> broader release.
- [ ] Track create completion rate, preview error rate, and lock-conflict rate.
- [ ] Define rollback trigger thresholds for create failures and feasibility/safety regressions.

## Definition of Done

- [ ] Current create form is enhanced in place and remains minimal by default.
- [ ] All advanced configuration is optional via progressive disclosure.
- [ ] Suggestions are profile-aware from available activities, efforts, current activity context, and profile metrics.
- [ ] Users retain ultimate control: editable values, explicit confirmation, lock precedence, no silent overrides.
- [ ] MVP contains no autonomous post-create plan mutation; post-create changes require explicit user confirmation.
