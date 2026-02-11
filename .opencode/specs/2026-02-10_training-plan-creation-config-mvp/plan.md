# Training Plan Creation Configuration MVP (Implementation Plan)

Last Updated: 2026-02-10
Status: Draft for implementation
Owner: Mobile + Core + Backend

This plan translates `./design.md` into concrete implementation steps for the existing mobile create flow.

## 1) Scope and Hard Rules

- This is an enhancement of the current create flow, not a product rewrite.
- Creation-time features in scope only:
  1. availability template,
  2. baseline load picker,
  3. auto-detected recent training influence (accept/edit/disable),
  4. configurable constraints and locks.
- MVP explicitly forbids autonomous post-create plan mutation.
- Post-create recommendations are allowed only as user-confirmed suggestions; no silent or automatic plan edits.
- UX must stay minimal by default and progressively disclose advanced controls.
- Must support full athlete spectrum: no-data beginner through high-data advanced athlete.
- Feasibility and safety must be computed deterministically and shown before final create.

## 2) Implementation Summary

Implement a single-page create enhancement with progressive disclosure and deterministic server validation.

1. Mobile: keep primary create route and add sectioned configuration panels (collapsed by default).
2. Core: add normalized creation-config schema, fallback heuristics, and lock/conflict resolution helpers.
3. tRPC: validate/normalize payload, return feasibility+safety readout, and persist provenance metadata.

No breaking replacement of existing training plan structures in this phase.

## 3) UX Contract (Minimal First, Progressive Disclosure)

### 3.1 Default visible surface (fast path)

- Required summary card with four compact rows: availability, baseline load, recent influence, constraints.
- Each row shows current selected value and source badge (`user`, `suggested`, `default`).
- Advanced detail remains collapsed until explicit user action.

### 3.2 Progressive disclosure panels

1. Availability template panel
   - Choose starter template (low/moderate/high) then optional day-level edit.
2. Baseline load panel
   - Suggested value + manual picker; user confirms final value.
3. Recent training influence panel
   - Show suggested influence, confidence, drivers, and action controls: accept, edit, disable.
4. Constraints and locks panel
   - Configure cap/floor, rest days, frequency bounds, max session duration.
   - Lock toggles on each lockable field with clear locked state UI.

### 3.3 Pre-create safety readout requirement

- Must display deterministic readout before final submit:
  - feasibility band: `under-reaching`, `on-track`, `over-reaching`,
  - safety band: `safe`, `caution`, `high-risk`,
  - top drivers list,
  - at least one actionable adjustment when risk is elevated.

## 4) Data Contract, Provenance, and Metadata Requirements

### 4.1 Creation payload expectations

Persist final confirmed values plus provenance metadata for each derived/suggested field.

Required metadata shape (logical contract):

```ts
type ValueSource = "user" | "suggested" | "default";
type InfluenceAction = "accepted" | "edited" | "disabled";

type ProvenanceMeta = {
  source: ValueSource;
  confidence: number | null; // 0..1 when suggested
  rationale: string[]; // short deterministic driver codes
  updated_at: string;
};

type LockMeta = {
  locked: boolean;
  locked_by: "user";
  lock_reason?: string;
};
```

Creation payload must include:

- `availability_config` + `availability_provenance`
- `baseline_load` + `baseline_load_provenance`
- `recent_influence` + `recent_influence_action` + `recent_influence_provenance`
- `constraints` + per-field `lock` metadata
- preview-evaluated feasibility/safety summary used at confirmation time

### 4.2 Deterministic precedence and conflict policy

Precedence order (highest to lowest):

1. user-entered locked values,
2. user-entered unlocked values,
3. user-confirmed suggestions,
4. defaults/templates.

Conflict handling:

- Locked values are never overridden by suggestions.
- Invalid combinations block create with explicit corrective options.
- User inputs remain intact when validation fails.

## 5) Deterministic Rule Placement (Core vs tRPC vs Mobile)

### 5.1 `@repo/core` (single source of deterministic logic)

- Canonical schemas for creation config/provenance/locks.
- Normalization from raw UI inputs to persisted config shape.
- Fallback heuristics for no-data athletes.
- Deterministic feasibility and safety classifiers.
- Conflict detection and precedence resolution helpers.

### 5.2 `@repo/trpc` (API boundary + orchestration)

- Enforce schema validation at create/preview boundary.
- Call core normalization and classifiers.
- Return path-specific errors for invalid/blocked combinations.
- Persist normalized values and metadata; reject partial/ambiguous payloads.

### 5.3 `apps/mobile` (interaction + state only)

- Present progressive disclosure UI and lock controls.
- Collect explicit user actions (accept/edit/disable).
- Render feasibility/safety readout and blocking states.
- Do not implement independent business rules that diverge from core.

## 6) File-Level Change Plan

## 6.1 Mobile

1. `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
   - Add sectioned progressive-disclosure panels for all four creation-time features.
   - Add per-field source badges and lock toggles.
   - Add feasibility/safety pre-submit readout and blocking conflict UI.
   - Emit explicit action values for recent influence (`accepted`/`edited`/`disabled`).

2. `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
   - Keep this as the canonical create entry point.
   - Build payload with normalized config + provenance + lock metadata.
   - Call preview endpoint before final create; enforce block on unresolved invalid states.
   - Submit final create only with user-confirmed values.

## 6.2 Core (`packages/core/*`)

1. `packages/core/schemas/training_plan_structure.ts`
   - Extend plan structure schemas with creation config sections and lock metadata (additive).

2. `packages/core/schemas/form-schemas.ts`
   - Add form-level validators for baseline ranges, constraints consistency, and influence action states.

3. `packages/core/schemas/index.ts`
   - Export new creation config/provenance/lock schemas and types.

4. `packages/core/plan/*` relevant normalization/helpers (new or updated)
   - `normalizeCreationConfig.ts`: normalize raw create inputs.
   - `resolveConstraintConflicts.ts`: deterministic conflict and precedence resolution.
   - `classifyCreationFeasibility.ts`: feasibility/safety classification with no-data fallback path.

## 6.3 Backend (`packages/trpc`)

1. `packages/trpc/src/routers/training_plans.ts`
   - Update create-time input contract to accept full config payload + provenance/locks.
   - Add/extend pre-create preview procedure returning feasibility+safety readout + drivers.
   - Enforce creation-time hard rule: no autonomous post-create mutation behavior flags in MVP.
   - Persist normalized config with source/confidence/lock metadata.

## 7) Phased Implementation Plan

Phase 1 - Core contract and deterministic engine

- Add schemas/types for config, provenance, and locks.
- Implement normalization, precedence, conflict, and feasibility/safety classifiers.

Phase 2 - tRPC boundary and persistence alignment

- Wire preview/create procedures to core deterministic engine.
- Validate and persist metadata-rich payloads.

Phase 3 - Mobile progressive disclosure UX

- Implement sectioned single-page flow and metadata-capturing form state.
- Add readout and blocking behavior for unresolved invalid configurations.

Phase 4 - Integration hardening

- Validate cross-package types, error messaging, and end-to-end create behavior.
- Confirm no automatic post-create mutation path is triggered in MVP.

## 8) Validation and Testing Commands

Minimum required commands after implementation:

- `apps/mobile`: `pnpm check-types`
- `packages/core`: `pnpm check-types`
- `packages/trpc`: `pnpm check-types`

Recommended full validation:

- repo root: `pnpm check-types && pnpm lint && pnpm test`

Manual behavior checks:

1. no-data athlete can complete create with conservative defaults,
2. high-data athlete sees confidence-labeled suggestions,
3. recent influence can be accepted/edited/disabled,
4. locked constraints cannot be overridden by suggestion updates,
5. invalid conflicts block create with clear actions,
6. post-create no autonomous mutation occurs without user confirmation.

## 9) Rollout Guardrails

- Gate with feature flag (example: `feature.trainingPlanCreateConfigMvp`).
- Roll out in stages: internal -> cohort -> broad release.
- Monitor create failures, preview error rates, and lock-conflict rejection frequency.
- Trigger rollback if feasibility/safety service errors spike or create completion drops materially.

## 10) Acceptance Checklist

1. Existing mobile create flow is enhanced in-place with minimal-first progressive disclosure.
2. All four required creation-time features are present and functional.
3. Feasibility and safety readouts are visible before create for all athlete data levels.
4. No-data fallback path and high-data recommendation path both work deterministically.
5. Payload includes source, confidence, rationale, and lock metadata for relevant fields.
6. Deterministic rules reside in core; trpc enforces; mobile presents only.
7. MVP enforces no autonomous post-create plan mutation.
8. Any post-create recommendation requires explicit user confirmation before plan changes.
