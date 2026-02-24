# Technical Plan: Training Plan Surface Consolidation

Last Updated: 2026-02-23
Status: Ready for implementation
Depends On: `./design.md`
Owner: Mobile Product + Mobile Engineering

## Objective

Consolidate overlapping training-plan screens into a smaller, clearer user experience: Plan Hub for daily usage, Composer for structure editing, and a lightweight Manage surface for lifecycle actions.

## Scope

### In Scope

- Training-plan route consolidation and deprecation plan
- CTA alignment so labels match actual destinations
- Shared data/query layer for plan surfaces
- Shared summary components to reduce duplicated UI
- Consolidation of quick-adjust flow into existing plan hub interactions
- Reduction of settings screen responsibilities to lifecycle/basic metadata

### Out of Scope

- Changes to planning science algorithms
- Core schema/data model migrations
- Major redesign of calendar rendering behavior
- Backend API contract changes unrelated to route/surface consolidation

## Current References

- Plan hub tab: `apps/mobile/app/(internal)/(tabs)/plan.tsx`
- Standard training plan view: `apps/mobile/app/(internal)/(standard)/training-plan.tsx`
- Settings view: `apps/mobile/app/(internal)/(standard)/training-plan-settings.tsx`
- Adjust view: `apps/mobile/app/(internal)/(standard)/training-plan-adjust.tsx`
- Legacy redirects:
  - `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plans-list.tsx`
- Route registry: `apps/mobile/lib/constants/routes.ts`
- Standard stack: `apps/mobile/app/(internal)/(standard)/_layout.tsx`

## Architecture Changes

## Phase 0 - Route Inventory and Guardrails

1. Inventory all training-plan routes and categorize as keep/consolidate/retire.
2. Confirm stable canonical destinations for each user intent:
   - daily plan usage
   - structure editing
   - lifecycle management
3. Define migration guardrail: no loss of existing capabilities.

Exit criteria:

- Route decision matrix documented.
- Canonical destination mapping approved.

## Phase 1 - CTA and Navigation Intent Alignment

1. Audit plan-related CTAs in tab and standard screens.
2. Update labels and destinations to match intent:
   - "Edit Structure" -> composer edit
   - "Quick Adjust" -> quick-adjust flow
   - "Manage Plan" -> settings/manage surface
3. Remove mislabeled or redundant action links.

Exit criteria:

- No CTA label points to an unintended screen.
- User can reach core intents in <=2 hops from Plan Hub.

## Phase 2 - Shared Snapshot Data Layer

1. Create shared hook (e.g., `useTrainingPlanSnapshot`) to centralize:
   - plan
   - status
   - insight timeline
   - fitness curves
   - refresh helpers
2. Adopt hook in Plan Hub and deep-link training-plan view.
3. Normalize loading/error states to avoid divergence.

Exit criteria:

- Duplicated training-plan query blocks reduced across route files.
- Consistent loading/error behavior in consolidated surfaces.

## Phase 3 - Shared Presentation Components

1. Extract reusable plan summary header and KPI cards.
2. Reuse components across tab plan and deep-link view where appropriate.
3. Keep deep-link-specific sections minimal and context-specific.

Exit criteria:

- Duplicated summary/status UI significantly reduced.
- Visual and content parity for shared plan summary blocks.

## Phase 4 - Quick Adjust and Settings Consolidation

1. Make quick adjust accessible from Plan Hub via sheet/modal (primary path).
2. Reduce/remove standalone adjust screen from primary flow.
3. Slim settings screen to lifecycle/basic metadata actions only.
4. Keep explicit structure-edit CTA in settings linking to composer edit.

Exit criteria:

- Quick adjust available without full-screen context switch.
- Settings no longer duplicates full plan overview content.

## Phase 5 - Legacy Route Deprecation

1. Mark legacy routes/constants deprecated.
2. Keep temporary redirects for one release cycle.
3. Remove deprecated stack entries/routes after usage confidence.

Exit criteria:

- Deprecated routes have migration-safe redirects.
- Route constants and stack entries reflect consolidated IA.

## Phase 6 - Validation and Telemetry

1. Verify user flows for create/edit/manage/quick-adjust from Plan Hub.
2. Track navigation and completion metrics post-change.
3. Compare before/after route depth and bounce/back rates.

Exit criteria:

- Primary plan workflows remain functional.
- UX simplification metrics trend in desired direction.

## Quality Gates

- `pnpm check-types`
- `pnpm lint`
- Targeted mobile tests for updated route and plan UI logic
- Full `pnpm test` when feasible (document unrelated baseline failures)

## Rollout Strategy

1. Land navigation and CTA corrections first.
2. Introduce shared hook/components behind low-risk incremental refactors.
3. Keep legacy redirects during migration window.
4. Remove legacy routes once telemetry confirms no meaningful usage.

## Definition of Done

1. Plan experience is centered on three surfaces: Plan Hub, Composer, Manage.
2. Duplicative full-overview plan screens are removed or minimized.
3. Quick adjust no longer depends on separate dedicated full screen in core flows.
4. Legacy training-plan routes are deprecated and scheduled/implemented for removal.
5. Shared data and summary UI reduce maintenance overhead and route drift.
