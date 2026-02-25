# Training Plan Creation UX Redesign (Reactive Chart + Library Consolidation)

Last Updated: 2026-02-11
Status: Draft for implementation planning
Owner: Product + Mobile + Web + Core + Backend

## 1) Purpose

This specification redesigns the training plan discovery and creation user experience to reduce duplication, improve comprehension, and improve mobile usability.

The redesign has two primary outcomes:

1. Consolidate plan discovery by removing the standalone Training Plans list page and using Library > Training Plans as the canonical list/detail surface.
2. Redesign training plan creation around a reactive, interactive predictive chart with a tabbed mobile-first configuration form.

## 2) In-Scope Experience Changes

1. Information architecture consolidation for training plan list and detail entry.
2. New creation screen composition with chart-first layout.
3. Interactive chart behaviors tied to live creation form updates.
4. Scrollable tab menu for all configuration sections under the chart.
5. Mobile ergonomics and accessibility requirements for the new flow.

## 3) Out of Scope

1. Autonomous post-create plan adaptation without user confirmation.
2. New coaching-role workflows or permissions.
3. Historical analytics dashboard expansion beyond creation-time guidance.
4. Changes to foundational training science models beyond what is needed for UX visualization contracts.

## 4) Product and UX Principles

1. Interpretation first: users should understand projected load and timeline before finalizing configuration.
2. User control first: user-entered values remain authoritative; no silent overrides.
3. Reactivity: high-impact form changes produce timely visual updates.
4. Mobile-first clarity: controls, tabs, and chart interactions must remain usable on small screens.
5. Single-surface continuity: reduce context switching during creation.
6. Explainability: chart annotations and risk states should be understandable without expert training.

## 5) Information Architecture Requirements

1. The standalone Training Plans list page shall be removed from primary navigation.
2. The Library page Training Plans tab shall be the canonical list/discovery surface for user training plans.
3. Existing deep links to the retired list route shall redirect to Library > Training Plans without dead ends.
4. Training plan detail routes may remain stable, but list-to-detail navigation shall originate from Library.
5. Empty-state and CTA paths that previously navigated to a standalone list page shall point to Library > Training Plans.

## 6) Creation Screen Layout Requirements

1. The create screen shall place an interactive predictive chart above the full configuration form.
2. The chart shall remain visible as the primary interpretation surface on initial render.
3. The full configuration form shall appear directly below the chart and occupy the majority of remaining screen real estate.
4. Form sections shall be grouped into a horizontally scrollable tab menu.
5. Tabs shall include all major configuration categories (for example: Goals, Availability, Load, Constraints, Periodization, Review).
6. Switching tabs shall preserve unsaved in-session inputs.

## 7) Predictive Chart Requirements

The chart shall support the following:

1. Full-plan duration projection of fitness/load trajectory.
2. Goal date markers shown at precise timeline positions.
3. Periodization phase visualization over time (for example: Base, Build, Peak, Taper, Recovery).
4. Reactive updates when high-impact creation fields change.
5. Interactive inspection of timeline points with date, projected value, and active phase context.
6. Visual interpretation of risk or feasibility state when plan settings indicate under-reaching or over-reaching behavior.

## 8) Reactivity and State Integrity Requirements

1. Chart and form shall read from one shared draft state and one shared preview output.
2. Recalculation shall be deterministic and based on normalized create input.
3. Recalculation may update projected outputs and guidance, but shall not silently change explicit user-entered values.
4. Recalculation triggers shall prioritize high-impact fields (goal dates, availability, load/progression, constraints).
5. Chart and form conflict messages shall use the same underlying validation and preview source.

## 9) Mobile UX and Accessibility Requirements

1. The tab menu shall remain horizontally scrollable and discoverable on small devices.
2. Active tab state shall be visually clear and screen-reader accessible.
3. Chart interactions shall meet mobile touch target expectations.
4. The flow shall remain usable across keyboard open/close, orientation shifts, and smaller viewport heights.
5. The chart shall expose text alternatives for critical annotations and statuses.

## 10) Risks and Mitigations

### 10.1 Chart Performance on Mobile

Risk:

- Frequent recomputation causes jank on lower-end devices.

Mitigations:

- Debounced updates for high-frequency edits.
- Shared preview cache and single query source.
- Fallback simplified rendering mode for low-performance conditions.

### 10.2 Projection Misinterpretation

Risk:

- Users interpret projection as a guaranteed outcome.

Mitigations:

- Explicit projection labeling.
- Inline interpretation guidance for uncertainty and risk.
- Visible rationale and factors when risk states are shown.

### 10.3 Tab Discoverability on Small Screens

Risk:

- Users miss later configuration sections in horizontal tabs.

Mitigations:

- Overflow affordances and clear active-tab indicator.
- Required/incomplete tab badges where applicable.
- Persisted tab state and lightweight progress cues.

### 10.4 Route Consolidation Regressions

Risk:

- Legacy links/bookmarks to removed list page fail or confuse users.

Mitigations:

- Route redirect with replace semantics.
- Canonical analytics events after redirect.
- Temporary compatibility path during rollout window.

## 11) Acceptance Criteria

1. Standalone Training Plans list page is removed from main navigation.
2. Library > Training Plans is the canonical list/detail entry surface for user plans.
3. Deprecated list routes redirect safely to Library > Training Plans.
4. Create screen presents interactive predictive chart at top and tabbed form below on mobile and larger screens.
5. Chart displays full-duration projection, goal dates, and periodization phases.
6. Chart reactively updates when key form inputs change.
7. Users can inspect chart points and understand what happens when and why.
8. Tabbed form is horizontally scrollable, usable on mobile, and preserves in-progress inputs.
9. Infeasible or high-risk configurations show actionable guidance without silent value replacement.
10. UX telemetry and quality guardrails are defined for staged rollout.
