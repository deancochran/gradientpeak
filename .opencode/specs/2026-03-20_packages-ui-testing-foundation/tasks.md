# Tasks: Packages UI Testing Foundation

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused verification passes, and the success check in the task text is satisfied.
- [ ] If blocked, leave the task unchecked and add the blocker inline.

## Phase 1: Spec and Ownership Contract

- [x] Task A - Create testing-foundation spec bundle. Success: `design.md`, `plan.md`, and `tasks.md` exist under `.opencode/specs/2026-03-20_packages-ui-testing-foundation/` and reference the completed UI restructure as prerequisite context.
- [x] Task B - Define selector contract. Success: the spec standardizes on shared `testId` with documented mapping to web `data-testid` and native `testID`, plus rules for when selectors belong on the root element versus a sub-slot.
- [x] Task C - Define testing responsibility boundaries. Success: the spec clearly assigns primitive tests to `packages/ui`, web app integration/browser tests to `apps/web`, and native screen/integration tests to `apps/mobile`.

## Phase 2: Shared Testability Foundation

- [x] Task D - Add shared test-props helper. Success: `packages/ui/src/lib/test-props.ts` defines the normalized testability contract and web/native mapping helpers without app-specific dependencies.
- [x] Task E - Export shared helper surface. Success: `packages/ui/src/lib/index.ts` exports the new helper/types and the package public API makes the testability helper available where intended.
- [x] Task F - Define component adoption rules. Success: shared component `shared.ts` files have a consistent pattern for owning `testId` and related normalized props.

## Phase 3: Package-Local Test Infrastructure

- [x] Task G - Add `@repo/ui` test scripts and config. Success: `packages/ui` owns package-local test scripts and a Vitest config that can run component tests without borrowing app config.
- [x] Task H - Add package-local test setup files. Success: `packages/ui/src/test/` contains minimal web/native setup and render helpers suitable for shared component tests.
- [x] Task I - Wire Turbo/package validation. Success: repo/package scripts can run `@repo/ui` tests directly and validation expectations are documented.

## Phase 4: Representative Component Adoption

- [x] Task J - Adopt normalized `testId` in first-wave shared primitives. Success: representative cross-platform components (`button`, `input`, `card`, `switch`, `tabs`) accept shared `testId` and emit correct platform selector props.
- [x] Task K - Document slot-level selector strategy. Success: components that need more than a root selector have a documented pattern for stable sub-slot naming without leaking platform-specific props.

## Phase 5: Package-Local Component Tests

- [x] Task L - Add web component tests in `packages/ui`. Success: current web-supported components are represented by colocated behavior tests and/or aggregate smoke/export coverage covering render behavior, accessible queries, and selector normalization.
- [x] Task M - Add native component tests in `packages/ui`. Success: current native-supported components are represented by colocated behavior tests and/or aggregate smoke/export coverage covering render behavior, basic interaction, and selector normalization.
- [x] Task N - Add at least one web-only and one native-only example. Success: the package test suite demonstrates how platform-specific components are tested without forcing false cross-platform parity.

## Phase 6: App Adoption and Validation

- [x] Task O - Add app-level adoption examples. Success: at least one `apps/web` E2E path and one `apps/mobile` test demonstrate consuming normalized selectors from shared components.
- [x] Task P - Preserve app-specific scope. Success: app tests validate composition, routing, and feature behavior without duplicating primitive contract coverage already present in `packages/ui`.
- [x] Task Q - Run focused validation. Success: `@repo/ui` typecheck/tests pass and relevant app-level checks pass for touched selector usage.
