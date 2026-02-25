# Design: Training Plan Surface Consolidation

Date: 2026-02-23
Owner: Mobile Product + Mobile App
Status: Proposed
Type: UX/IA Simplification + Maintainability

## Executive Summary

The current training-plan experience spreads similar functionality across too many screens,
increasing user cognitive load and maintenance cost. We will consolidate the experience into a
small set of intentional surfaces:

1. Plan Hub (daily use)
2. Composer (create/edit structure)
3. Manage Plan (lightweight lifecycle actions)

This reduces duplicate data fetching/UI, shortens navigation depth, and improves immersion while
preserving power-user capabilities.

## Problem

Users currently encounter multiple overlapping routes for plan overview, settings, adjust, and
legacy create flows. Several screens repeat similar cards and status context.

Observed overlap:

- `/(tabs)/plan` already contains summary, insights, calendar, and actions.
- `/training-plan` repeats plan/status/fitness/progress/structure content.
- `/training-plan-settings` repeats plan/status context before management actions.
- `/training-plan-adjust` duplicates quick-adjust concepts and links to edit.
- Legacy compatibility routes (`method-selector`, `wizard`, `review`, `training-plans-list`) add
  route surface area with little unique value.

Resulting issues:

- Too many places to do "the same thing"
- Fragmented mental model
- Higher regression risk from duplicated UI/data logic
- Harder to onboard users into a coherent plan workflow

## Goals

1. Reduce user-facing training-plan surfaces to a clear, minimal IA.
2. Make Plan tab the single day-to-day hub.
3. Make Composer the only structure-authoring experience (create/edit parity).
4. Keep plan lifecycle actions available but lightweight and contextual.
5. Remove or retire legacy/duplicate screens and route constants.
6. Improve maintainability through shared data hooks and reusable summary components.

## Non-Goals

- No change to planning science, projection algorithms, or backend semantics.
- No rewrite of calendar interactions or activity scheduling logic.
- No breaking change to persisted training plan structures.

## Information Architecture (Target)

Primary surfaces:

1. Plan Hub (`/(tabs)/plan`)
   - Purpose: daily planning and execution
   - Contains: current plan summary, insights, calendar, quick actions

2. Plan Composer (`/training-plan-create`, `/training-plan-edit?id=`)
   - Purpose: full structure authoring (goals, availability, constraints, tuning)
   - Single workflow for both create and edit

3. Manage Plan (modal/sheet or reduced settings route)
   - Purpose: rename, description, activate/deactivate, delete
   - No duplicate structure editing UI

Secondary deep-link surface:

- `/training-plan?id=` remains only for direct library/deep-link entry to a specific plan,
  but should avoid duplicating tab hub behavior.

## Screen Rationalization

Keep:

- `/(tabs)/plan`
- `/training-plan-create`
- `/training-plan-edit`
- `/training-plan` (deep-link context only)

Consolidate:

- `/training-plan-settings` -> slim Manage Plan surface (lifecycle actions only)
- `/training-plan-adjust` -> inline quick adjust in Plan Hub (sheet/card action)

Retire (after migration window):

- `/training-plan-method-selector`
- `/training-plan-wizard`
- `/training-plan-review`
- `/training-plans-list` (already redirecting)

## UX Principles

1. One primary place per intent
   - View today: Plan Hub
   - Change structure: Composer
   - Manage lifecycle: Manage Plan

2. Action labels map to actual destinations
   - "Edit Structure" always opens Composer edit
   - "Quick Adjust" opens quick-adjust sheet/flow
   - "Manage Plan" opens lifecycle controls

3. Minimize route hops
   - Keep user in Plan tab for most actions
   - Use modal/sheet for lightweight management

4. Preserve context
   - Quick actions should keep calendar/insight context visible when possible

## Technical Approach

### 1) Route Surface Reduction

- Deprecate unused/legacy training-plan route constants.
- Remove redundant stack registrations for retired screens.
- Keep backward compatibility during migration via temporary redirects.

### 2) Shared Data Layer for Plan Surfaces

Create a shared hook (e.g., `useTrainingPlanSnapshot`) that provides:

- active plan
- current status
- insight timeline
- fitness curves
- refresh/invalidate helpers

This prevents query duplication and inconsistent loading/error handling across Plan Hub and
deep-link plan view.

### 3) Shared Presentation Components

Extract reusable components for:

- plan summary header
- key metrics row (progress/adherence/fitness)
- common empty-state CTA patterns

Use these in both Plan Hub and deep-link training-plan view where needed.

### 4) Quick Adjust Consolidation

- Promote `QuickAdjustSheet` as the canonical quick-adjust interaction.
- Remove separate adjust screen dependency in primary user flows.
- Ensure quick adjust CTA from Plan Hub triggers this sheet directly.

### 5) Settings Scope Reduction

- Keep settings limited to lifecycle and basic metadata.
- Remove duplicated overview/insight content from settings route.
- Add explicit CTA to Composer for structure edits.

## Migration Strategy

Phase 1: Navigation and CTA correctness

- Align all "Adjust", "Settings", and "Edit" CTAs with intended destination.
- Ensure no CTA labels imply behavior they do not perform.

Phase 2: Shared data/component extraction

- Introduce shared hook and summary components.
- Replace duplicated query blocks/UI blocks incrementally.

Phase 3: Route deprecation

- Mark legacy routes as deprecated in constants and stack.
- Keep redirects for one release cycle.
- Remove fully after telemetry confirms negligible usage.

## Metrics and Validation

Primary success metrics:

- Reduced median route depth to complete common plan tasks
- Higher completion rate for "edit plan structure" action
- Lower bounce/back events between plan-related screens
- Lower code duplication in plan-related route files

Operational checks:

- No increase in failed plan-save operations
- No regression in create/edit parity flow
- Stable performance for Plan tab load and refresh

## Risks and Mitigations

- Risk: Existing users rely on legacy routes/bookmarks.
  - Mitigation: temporary redirects + analytics-driven retirement window.

- Risk: Over-consolidation hides advanced controls.
  - Mitigation: keep composer as full advanced surface; only remove duplication.

- Risk: Refactor introduces query regressions.
  - Mitigation: shared hook with targeted tests and staged rollout.

## Acceptance Criteria

1. Users can complete all core training-plan intents from 3 surfaces: Plan Hub, Composer, Manage.
2. No duplicate full-overview dashboards remain in plan routes.
3. Legacy create-flow routes are redirected/deprecated and scheduled for removal.
4. Quick adjust is accessible from Plan Hub without navigating to a separate full screen.
5. Settings/Manage no longer duplicates plan overview content.
6. Shared query/component architecture reduces duplicated plan logic across routes.
