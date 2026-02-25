# Training Plan Creation Configuration MVP (Implementation Plan)

Last Updated: 2026-02-10
Status: Draft for implementation
Owner: Mobile + Core + Backend

This plan translates `./design.md` into concrete implementation steps for the existing mobile create flow.

It is explicitly scoped to enhance the current form surfaces at:

- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

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
- Progressive disclosure is optional; users can complete creation without opening advanced panels when defaults are valid.
- Must support full athlete spectrum: no-data beginner through high-data advanced athlete.
- Feasibility and safety must be computed deterministically and shown before final create.

## 2) Implementation Summary

Implement a single-page create enhancement with progressive disclosure and deterministic server validation.

1. Mobile: keep primary create route and add sectioned configuration panels (collapsed by default).
2. Core: add normalized creation-config schema, fallback heuristics, and lock/conflict resolution helpers.
3. tRPC: validate/normalize payload, return feasibility+safety readout, and persist provenance metadata.

No breaking replacement of existing training plan structures in this phase.

Recommendation configuration should be profile-aware at creation time by using available:

- completed activities,
- activity efforts,
- current activity focus,
- profile metrics,
- and explicit create-form inputs.

## 3) UX Contract (Minimal First, Progressive Disclosure)

### 3.1 Default visible surface (fast path)

- Required summary card with four compact rows: availability, baseline load, recent influence, constraints.
- Each row shows current selected value and source badge (`user`, `suggested`, `default`).
- Advanced detail remains collapsed until explicit user action.
- Primary submit path remains visible and usable without visiting advanced panels.

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

### 3.4 Adaptive prefill behavior (non-intrusive)

- Prefills are recomputed when create screen loads and when user changes high-impact inputs.
- Recompute updates suggestion cards only; it never silently overwrites user-modified fields.
- If a field is locked, recompute may only show an informational conflict indicator.
- If no usable history exists, fallback to conservative defaults and low-confidence guidance.

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

Signal context payload requirement:

- Include normalized creation-context summary used for suggestion generation (for explainability and debugging), such as:
  - history availability state (`none`, `sparse`, `rich`),
  - recent consistency marker,
  - effort confidence marker,
  - profile-metric completeness marker.

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
- Creation-context derivation from profile signals (activities, efforts, profile metrics).
- Fallback heuristics for no-data athletes.
- Deterministic feasibility and safety classifiers.
- Conflict detection and precedence resolution helpers.

### 5.2 `@repo/trpc` (API boundary + orchestration)

- Enforce schema validation at create/preview boundary.
- Call core normalization and classifiers.
- Build creation-context input from profile data for suggestion generation.
- Return path-specific errors for invalid/blocked combinations.
- Persist normalized values and metadata; reject partial/ambiguous payloads.

### 5.3 `apps/mobile` (interaction + state only)

- Present progressive disclosure UI and lock controls.
- Collect explicit user actions (accept/edit/disable).
- Render feasibility/safety readout and blocking states.
- Preserve minimal information density (chips/rows/compact labels) and optional detail expansion.
- Do not implement independent business rules that diverge from core.

## 6) File-Level Change Plan

## 6.1 Mobile

1. `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
   - Add sectioned progressive-disclosure panels for all four creation-time features.
   - Add per-field source badges and lock toggles.
   - Add feasibility/safety pre-submit readout and blocking conflict UI.
   - Emit explicit action values for recent influence (`accepted`/`edited`/`disabled`).
   - Keep panels collapsed by default and only reveal details on user action or high-risk highlight.
   - Add compact context banner (for example: `Based on your last 6 weeks`) with optional `View why`.

2. `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
   - Keep this as the canonical create entry point.
   - Build payload with normalized config + provenance + lock metadata.
   - Request creation-context-based suggestions for this profile at screen start.
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
   - `deriveCreationContext.ts`: summarize available profile signals for recommendation seeding.
   - `deriveCreationSuggestions.ts`: deterministic suggestion builder using creation context and user inputs.

## 6.3 Backend (`packages/trpc`)

1. `packages/trpc/src/routers/training_plans.ts`
   - Update create-time input contract to accept full config payload + provenance/locks.
   - Add/extend pre-create preview procedure returning feasibility+safety readout + drivers.
   - Add/extend creation-context suggestion procedure for profile-aware prefills.
   - Enforce creation-time hard rule: no autonomous post-create mutation behavior flags in MVP.
   - Persist normalized config with source/confidence/lock metadata.

## 7) Phased Implementation Plan

Phase 1 - Core contract and deterministic engine

- Add schemas/types for config, provenance, and locks.
- Implement normalization, precedence, conflict, and feasibility/safety classifiers.

Phase 2 - tRPC boundary and persistence alignment

- Wire preview/create procedures to core deterministic engine.
- Wire creation-context suggestion generation from activities/efforts/profile metrics.
- Validate and persist metadata-rich payloads.

Phase 3 - Mobile progressive disclosure UX

- Implement sectioned single-page flow and metadata-capturing form state.
- Add readout and blocking behavior for unresolved invalid configurations.
- Ensure low-density default UI with optional deep detail and non-intrusive suggestion refresh.

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
7. create remains completable on minimal path without opening advanced panels.
8. suggestion quality changes appropriately between no-data and rich-data athlete profiles.

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
