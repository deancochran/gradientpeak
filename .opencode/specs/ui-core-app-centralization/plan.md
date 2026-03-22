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

1. Promote mobile parsed field components into a shared field/input layer.
2. Promote generic shell components such as settings groups, empty/error states, and metric cards.
3. Generalize reusable web composites like `apps/web/src/components/ui/data-table.tsx` only after prop contracts are stable.

Exit criteria:
- both apps can compose the same shared composites where the behavior is shared
- app tests no longer own component behavior that belongs in `@repo/ui`

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
5. Shared field/composite UI promotion
6. Broader feature parity work on top of the new shared foundation
