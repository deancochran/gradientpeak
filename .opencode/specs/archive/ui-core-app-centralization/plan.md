# Plan

## Phase 0 - Boundary Cleanup

Goal: make shared packages safe to depend on broadly.

1. Normalize `@repo/core` boundaries so exported modules do not rely on `@repo/supabase` types where domain-owned types or adapter inputs would be better.
2. Decide whether `@repo/ui` keeps deep-import consumption as the standard or adds a clearer cross-platform barrel strategy.
3. Add missing shared-platform primitives required for adoption, starting with web `Switch`.

Exit criteria:
- shared package contracts match their stated purpose
- web and mobile can adopt new shared modules without package-boundary confusion

## Phase 1 - Extract Pure Mobile Logic Into `@repo/core`

Goal: move business rules out of mobile app folders.

1. Extract goal draft creation/hydration from `apps/mobile/lib/goals/goalDraft.ts`.
2. Extract reusable parsing helpers from `apps/mobile/lib/training-plan-form/input-parsers.ts`.
3. Extract training-plan validation and related adapter logic from `apps/mobile/lib/training-plan-form/validation.ts`.
4. Evaluate `metricUnits`, training-adjustment helpers, and recorder plan validation for follow-on extraction.

Exit criteria:
- mobile imports these behaviors from `@repo/core`
- new shared functions have focused package-level tests

## Phase 2 - Promote Shared Feature UI Into `@repo/ui`

Goal: move reusable app composites out of app folders.

Scope note: this phase is launch-first. Complete Tier 1, then reassess whether Tier 2 or Tier 3 should happen before launch.

1. Promote mobile parsed field components into a shared field/input layer.
2. Add Tier 1 composed shells first:
   - web `AuthPageShell` / `AuthCardFrame`
   - shared auth field-stack composition on top of `Form`
   - native `PageSheetModal`
   - cross-platform `SegmentedControl`
3. Add Tier 2 web utility composites once Tier 1 contracts are stable:
   - app-header/account-menu shell
   - icon-badge toolbar trigger
   - `DataTable` adapter for TanStack table usage
4. Expand existing shared summary-state families instead of growing more app-local variants:
   - `MetricCard`
   - `EmptyStateCard`
   - `ErrorStateCard`

Exit criteria:
- both apps can compose the same shared composites where the behavior is shared
- app tests no longer own component behavior that belongs in `@repo/ui`
- Tier 1 shared shells are adopted by at least one real consumer in the originating app

## Phase 2A - Web Auth And Shell Consolidation

Goal: eliminate repeated web auth page/form composition.

1. Extract the repeated centered auth route frame from `apps/web/src/app/(external)/auth/*/page.tsx` into package-owned shell components.
2. Refactor auth forms to use the shared `Form` layer and package-owned card/footer composition where practical.
3. Keep all mutation wiring, redirects, and auth-provider interactions in app code.

Exit criteria:
- repeated auth page shells disappear from `apps/web`
- auth forms share one composition pattern instead of four local layouts

## Phase 2B - Mobile Overlay And Selection Shell Consolidation

Goal: stop rebuilding native overlay scaffolds in app code.

1. Introduce a reusable native page-sheet modal shell for header, dismiss, scroll body, and footer actions.
2. Adopt it first in `ScheduleActivityModal` and `CalendarPlannedActivityPickerModal`.
3. Introduce a shared segmented-control wrapper and adopt it from time-range and calendar-view selectors.

Exit criteria:
- at least two mobile overlays share the same package-owned shell
- mobile segmented selectors no longer hand-style `ToggleGroup` directly for common cases

## Phase 2C - Web Toolbar And Table Utilities

Goal: centralize repeated dashboard utility UI.

1. Extract an `IconBadgeButton` style trigger for messages, notifications, and similar toolbar actions.
2. Extract a generic `DataTable` adapter into `packages/ui`.
3. Evaluate whether account-menu and app-header shells should move in the same pass or follow after the trigger utility proves out.

Exit criteria:
- message/notification triggers share one package-owned trigger surface
- generic TanStack table composition no longer lives in app-local `src/components/ui`
- this phase is skipped if launch work does not need another table or toolbar pass yet

## Phase 2D - Shared Summary-State Family Expansion

Goal: broaden existing shared families before new local variants appear.

1. Expand `MetricCard` for compact stat-card and comparison-card use cases without embedding domain logic.
2. Expand `EmptyStateCard` and `ErrorStateCard` for richer title/body/action layouts and optional full-screen variants.
3. Replace app-local summary-state variants where the props can stay app-agnostic.

Exit criteria:
- app-local generic stat/empty/error surfaces shrink
- shared summary-state components cover the most common app needs without domain coupling
- this phase can be deferred entirely until after launch if current local variants are stable enough

## Phase 3 - Adopt Shared Contracts In Web

Goal: make web a first-class consumer of `@repo/core`.

1. Replace the local profile schema in `apps/web/src/app/(internal)/settings/page.tsx` with a shared core contract.
2. Move notification parsing from `apps/web/src/app/(internal)/notifications/page.tsx` into shared core adapters.
3. Move messaging/coaching row shaping into shared core adapters or contracts.
4. Prepare web feature parity work to reuse existing core logic for goals, training plans, activity summaries, and route formatting.

Exit criteria:
- `apps/web/src` has direct `@repo/core` usage for feature logic
- web pages no longer parse `unknown` payloads ad hoc when a shared schema can own that responsibility

## Phase 4 - Test Realignment

Goal: put each test in the package that owns the behavior.

1. Move pure logic tests from app folders into `packages/core`.
2. Move reusable composite rendering tests into `packages/ui`.
3. Keep app tests focused on route wiring, mutation flows, and platform-specific behavior.
4. Keep Playwright/Maestro coverage focused on integration rather than basic business-rule validation.

Exit criteria:
- shared logic is covered by fast package-level tests
- app-level test suites shrink toward orchestration and integration coverage

## Recommended Execution Order

1. Boundary cleanup
2. Core parser/validation extraction
3. Web settings adoption of shared profile contract
4. Shared notification/message/coaching adapters
5. Phase 2A web auth shell consolidation
6. Phase 2B mobile overlay and segmented-control consolidation
7. Launch checkpoint: decide whether Tier 2 or Tier 3 work still improves near-term ship velocity
8. Phase 2C web toolbar/table utilities only if justified by active launch work
9. Phase 2D shared summary-state expansion only if justified by active launch work
10. Broader feature parity work on top of the new shared foundation
