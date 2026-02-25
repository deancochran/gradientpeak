# Training Plan Creation UX Redesign (Task Checklist)

Last Updated: 2026-02-11
Status: Ready for implementation
Owner: Mobile + Web + Core + Backend

This checklist implements `./design.md` and `./plan.md`.

## Phase 1 - Information Architecture Consolidation

- [ ] Remove standalone training plans list page from primary navigation surfaces.
- [ ] Define canonical route helper for Library > Training Plans tab entry.
- [ ] Add redirect shim from legacy training plans list route to canonical Library tab route.
- [ ] Update all CTAs/empty states/navigation callers to use canonical Library route.
- [ ] Ensure plan detail still opens correctly from Library list items.
- [ ] Add analytics mapping so legacy route traffic is attributed to canonical route.

## Phase 2 - Shared Draft State and Preview Contract

- [ ] Define `CreationDraft` model for all create-form editable fields.
- [ ] Add deterministic draft-to-preview input selector.
- [ ] Implement single preview pipeline for chart + form (shared query key and cache).
- [ ] Debounce preview recomputation for high-impact input changes.
- [ ] Ensure preview updates never silently overwrite explicit user-entered values.

## Phase 3 - Predictive Chart Implementation

- [ ] Add top-of-screen `PredictiveChartPanel` in create flow.
- [ ] Render full-duration projected fitness/load curve.
- [ ] Render goal date markers in timeline positions.
- [ ] Render periodization phase overlays (Base/Build/Peak/Taper/Recovery or equivalent).
- [ ] Add interactive inspection behavior (tap/scrub + contextual values).
- [ ] Show risk/feasibility interpretation in chart context when applicable.
- [ ] Add fallback rendering state for low-data and low-performance scenarios.

## Phase 4 - Tabbed Creation Form UX

- [ ] Refactor create form into horizontally scrollable tab menu.
- [ ] Add tab sections for key configuration groups (Goals, Availability, Load, Constraints, Periodization, Review).
- [ ] Preserve in-progress values when switching tabs.
- [ ] Ensure tab overflow/discoverability on small mobile viewports.
- [ ] Keep inputs accessible with keyboard open/close and orientation changes.
- [ ] Add clear conflict and correction guidance in affected tabs/review area.

## Phase 5 - API and Data Contract Alignment

- [ ] Ensure preview API returns projection series suitable for chart rendering.
- [ ] Ensure preview API returns goal marker metadata and periodization windows.
- [ ] Ensure preview/create responses include deterministic risk/feasibility outputs.
- [ ] Keep create boundary validation aligned with preview logic.
- [ ] Verify user authority rules: explicit user values are never silently replaced.

## Phase 6 - Quality Assurance and Edge Cases

- [ ] Add navigation tests for retired list route redirect behavior.
- [ ] Add integration tests for form-to-chart reactive synchronization.
- [ ] Add tests for annotation rendering (goal dates + phase overlays).
- [ ] Add mobile tests for tab overflow, scrolling, keyboard, and state persistence.
- [ ] Add sparse-data and missing-field tests for stable chart/form behavior.
- [ ] Add invalid-input tests for actionable errors and no chart crashes.
- [ ] Add accessibility checks (focus order, labels, touch targets, contrast).

## Phase 7 - Instrumentation and Rollout

- [ ] Instrument key events (`plan_create_started`, `plan_chart_recomputed`, `plan_validation_error`, `plan_saved`, legacy redirect hits).
- [ ] Create dashboard for funnel and reliability metrics.
- [ ] Configure feature flag rollout stages and checkpoint reviews.
- [ ] Define and document rollback thresholds and kill-switch process.
- [ ] Validate release on iOS Safari, Android Chrome, and desktop Chromium/WebKit/Firefox.

## Phase 8 - Quality Gates

- [ ] Run `pnpm check-types` in `packages/core`.
- [ ] Run `pnpm check-types` in `packages/trpc`.
- [ ] Run `pnpm check-types` in `apps/mobile`.
- [ ] Run `pnpm check-types` in `apps/web` if web routes/components are changed.
- [ ] Run full validation when feasible: `pnpm check-types && pnpm lint && pnpm test`.

## Definition of Done

- [ ] Training plan list/discovery is fully consolidated under Library > Training Plans.
- [ ] Standalone list route is deprecated safely with redirect compatibility.
- [ ] Creation screen is chart-first and reacts to meaningful configuration updates.
- [ ] Chart clearly conveys goal timing, periodization, and projected load/fitness trajectory.
- [ ] Tabbed form is mobile-usable, scrollable, and state-preserving.
- [ ] Validation and guidance remain clear, actionable, and non-destructive.
- [ ] Telemetry and rollout controls are active and monitored.
