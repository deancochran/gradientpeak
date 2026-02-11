# Training Plan Creation UX Redesign (Implementation Plan)

Last Updated: 2026-02-11
Status: Draft for implementation
Owner: Mobile + Web + Core + Backend

This plan translates `./design.md` into implementation phases for navigation consolidation and the reactive chart-based creation experience.

## 1) Scope and Hard Rules

- Enhance existing product surfaces; do not introduce duplicate list routes.
- Remove standalone training plan list page from user-facing primary navigation.
- Use Library > Training Plans as the canonical listing/discovery and detail entry flow.
- Redesign creation flow as chart-first with tabbed, scrollable form below.
- Keep user-entered values authoritative; no silent overrides from recomputation.
- Use one shared draft state and one shared preview output for chart + form.
- Maintain mobile usability and accessibility as first-class requirements.

## 2) Technical Strategy Summary

1. Navigation/IA:
   - Deprecate standalone list route in favor of Library tab route targeting.
   - Keep temporary redirect shim for legacy deep links.
2. Creation state architecture:
   - Establish `CreationDraft` single source of truth.
   - Use unified preview pipeline to power chart and feasibility/risk guidance.
3. UI architecture:
   - Introduce `PredictiveChartPanel` at top.
   - Introduce horizontally scrollable `ConfigTabs` below with section content.
4. Rule placement:
   - Core package computes deterministic projections/validation inputs.
   - tRPC preview/create procedures orchestrate and validate.
   - Mobile/web UI render state and interactions only.

## 3) Route and Information Architecture Migration

### 3.1 Canonical Route Behavior

- Make Library route with Training Plans tab selection the canonical list entry point.
- Retire direct standalone list page from primary navigation.
- Keep plan detail route stable for low-risk compatibility.

### 3.2 Redirect and Compatibility Plan

- Add temporary redirect from legacy list route to Library Training Plans tab.
- Use replace-style navigation to avoid back-stack loops.
- Instrument redirect usage for one release cycle before hard removal.

### 3.3 CTA and Empty State Updates

- Replace all references to old list route with canonical Library route.
- Update no-plan states to guide users into Library Training Plans.

## 4) Creation Flow Architecture

### 4.1 Screen Composition

Top section:

- `PredictiveChartPanel`
  - full-duration projection line(s)
  - goal date markers
  - periodization phase overlays
  - on-point inspection tooltip/sheet

Bottom section:

- `ConfigTabs`
  - horizontal scrollable tab bar
  - tab panels for Goals, Availability, Load, Constraints, Periodization, Review
  - unsaved state preserved across tab switches

### 4.2 Shared State and Preview Pipeline

- Introduce `CreationDraft` shape for all editable values.
- Transform draft to normalized preview input via shared selector.
- Debounce preview recalculation on high-impact field changes.
- Feed the same preview response to chart rendering and risk/feasibility UI.

### 4.3 Recomputation Rules

- Recompute on key fields (goal dates, availability, load/progression, constraints).
- Never overwrite explicit user-entered values silently.
- Surface conflicts and infeasible states with actionable adjustment prompts.

## 5) File-Level Change Plan

## 5.1 Mobile

1. `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
   - host shared draft + preview orchestration
   - provide chart-first screen composition
2. `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
   - refactor into tabbed section container and panels
3. New/updated chart components under training-plan create components
   - interactive projection rendering
   - markers/phase overlays
   - inspection interaction model
4. Routing constants and navigation callers
   - replace standalone list references with Library Training Plans tab targeting

## 5.2 Web (if feature parity required)

1. Library training plans tab entry flow alignment with canonical IA.
2. Redirect handling for retired list route equivalent.
3. Creation page shell alignment to chart-first + tabbed form if shared behavior is required.

## 5.3 Core + tRPC

1. `packages/core`
   - deterministic normalization inputs for preview
   - projection support outputs required by chart annotations
   - feasibility/risk classifications that map to chart + form guidance
2. `packages/trpc/src/routers/training_plans.ts`
   - preview endpoint returns projection series + goal markers + periodization windows + risk guidance
   - create endpoint validates against latest deterministic rules and preserved user authority

## 6) Phased Implementation

Phase 1 - IA consolidation and route migration

- Add canonical route helper for Library Training Plans tab.
- Add legacy route redirect shim.
- Update all internal navigation callers and CTAs.

Phase 2 - Shared creation state and preview contract

- Implement `CreationDraft` shared shape.
- Implement preview transform and query orchestration.
- Ensure chart and form both consume the same preview result.

Phase 3 - Chart-first creation UI

- Add interactive chart with markers and periodization overlays.
- Add inspection interaction (tap/scrub) with contextual data.
- Connect chart updates to debounced high-impact form changes.

Phase 4 - Tabbed form UX

- Convert form sections into horizontally scrollable tabs.
- Ensure state persistence across tabs and mobile ergonomics.
- Add clear conflict and risk guidance in relevant tabs and review.

Phase 5 - Hardening, QA, and rollout

- Run test matrix across navigation, reactivity, mobile behavior, and accessibility.
- Stage release via feature flag.
- Monitor telemetry and rollback thresholds.

## 7) Validation and Testing Commands

Minimum type checks after implementation:

- `apps/mobile`: `pnpm check-types`
- `apps/web`: `pnpm check-types` (if touched)
- `packages/core`: `pnpm check-types`
- `packages/trpc`: `pnpm check-types`

Recommended full validation:

- repo root: `pnpm check-types && pnpm lint && pnpm test`

## 8) Rollout Guardrails

- Feature flag example: `feature.trainingPlanReactiveCreateUx`.
- Rollout sequence: internal -> 10% cohort -> 50% -> 100%.
- Monitor:
  - create completion rate
  - preview error rate
  - chart recompute latency p95
  - redirect hit rate for legacy route
  - mobile abandonment at tab transitions
- Define rollback triggers before release and keep kill-switch active.

## 9) Acceptance Checklist

1. Standalone list page is not accessible from primary nav.
2. Library Training Plans tab acts as canonical list/detail entry.
3. Legacy list links redirect safely.
4. Create flow is chart-first with reactive projection behavior.
5. Goal dates and periodization are visually represented on the chart.
6. Form tabs are scrollable, mobile-usable, and preserve in-progress state.
7. Risk/infeasibility states provide actionable guidance with no silent value replacement.
8. Telemetry and staged rollout controls are implemented.
