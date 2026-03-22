# Tasks: Packages UI Single-Package Architecture

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused verification passes, and the success check in the task text is satisfied.
- [ ] If blocked, leave the task unchecked and add the blocker inline.

## Phase 1: Architecture Contract

- [x] Task A - Create single-package architecture spec. Success: `design.md`, `plan.md`, and `tasks.md` exist under `.opencode/specs/2026-03-20_packages-ui-single-package-architecture/` and document keeping all shared UI ownership in `packages/ui`.
- [x] Task B - Define internal package boundaries. Success: the spec clearly separates `theme`, `lib`, `shared.ts`, `fixtures.ts`, `index.web.tsx`, `index.native.tsx`, and package test ownership.
- [x] Task C - Define preview ownership scope. Success: the spec assigns web previews to `apps/web` and mobile previews to `apps/mobile` instead of centralizing preview ownership in `packages/ui`.

## Phase 2: Testing Runtime Strategy

- [x] Task D - Define shared fixture strategy. Success: the spec documents runtime-agnostic shared fixtures as the main reuse mechanism across package tests, previews, Playwright, and Maestro.
- [x] Task E - Define runtime-owned verification strategy. Success: the spec prefers Playwright for web runtime confidence and Maestro for mobile runtime confidence rather than over-centralizing package-owned runners.
- [x] Task F - Define app testing boundaries. Success: the spec keeps app integration/browser/device flows and preview environments in `apps/web` and `apps/mobile` rather than over-expanding package-owned tooling.

## Phase 3: Package Structure and Conventions

- [x] Task G - Define component folder contract. Success: the spec documents the expected contents of a shared component folder including `shared.ts`, optional `fixtures.ts`, platform renderers, and any colocated package tests.
- [x] Task H - Define shared selector/testability conventions. Success: the spec keeps `testId` and related shared testability props as package-level contracts without changing existing public direction.
- [x] Task I - Define config ownership. Success: the spec assigns preview and runtime test ownership to the apps while keeping `packages/ui` focused on shared source, fixtures, and minimal package-level test config.

## Phase 4: Migration Planning

- [x] Task J - Plan shared fixture rollout. Success: the plan describes how shared fixtures are added and reused across package tests, previews, Playwright, and Maestro.
- [x] Task K - Plan preview ownership migration. Success: the plan outlines moving or replacing package-owned preview assumptions with app-owned preview surfaces.
- [x] Task L - Plan cleanup and validation. Success: the plan includes reducing obsolete package-owned preview/testing complexity and defines validation commands spanning `packages/ui`, Playwright, and Maestro.

## Phase 5: Implementation Backlog

- [x] Task M - Audit current package-owned preview assets. Success: all `packages/ui` preview-specific files, scripts, docs, and dependencies that must move, be deleted, or be replaced are listed before code changes begin. Progress note: package-owned `.storybook/*` and `storybook` scripts were identified as preview ownership drift, and `packages/ui/README.md` was updated to point preview ownership at the apps.
- [x] Task N - Define shared fixture rollout set. Success: a first-wave list of shared components that need `fixtures.ts` is documented with scope and expected consumers. Progress note: first-wave fixtures were added for `button`, `input`, `card`, and `tabs` and reused by stories/tests.
- [x] Task O - Plan web preview hosting changes. Success: the exact target location, scripts, and dependencies for `apps/web` preview ownership are defined. Progress note: `apps/web/.storybook/*` now hosts the web preview config, `apps/web/package.json` now owns Storybook scripts, `apps/web/src/app/dev/ui-preview/page.tsx` now provides a runtime-owned preview page, and `pnpm --filter web build-storybook -- --ci` passes.
- [x] Task P - Plan mobile preview hosting changes. Success: the exact target route or development entry strategy for `apps/mobile` preview ownership is defined. Progress note: the first mobile preview surface now exists at `apps/mobile/app/(external)/ui-preview.tsx`, with room to expand into dedicated preview child screens later.
- [x] Task Q - Plan package test reduction. Success: existing `packages/ui` tests are categorized into keep, rewrite, move-up, or remove. Progress note: the implementation plan now includes a concrete reduction rubric, package-owned preview config/scripts have been removed, and `packages/ui` Vitest coverage is now narrowed to lightweight web contract tests.
- [x] Task R - Define selector/fixture export strategy for Playwright and Maestro. Success: the implementation approach for direct imports, constants, or generated artifacts is documented before automation changes begin. Progress note: `packages/ui` now exports `./components/*/fixtures` for direct TypeScript consumers, Playwright consumes those fixtures directly in `apps/web/e2e/specs/ui-preview.spec.ts`, and Maestro remains aligned to the same stable selector contract for future flow updates.

## Phase 7: First Runtime Integrations

- [x] Task V - Add runtime-owned web preview page. Success: `apps/web` contains a fixture-driven runtime preview page that imports shared components and fixtures from `@repo/ui`. Progress note: `apps/web/src/app/dev/ui-preview/page.tsx` now serves this role and is covered by Playwright.
- [x] Task W - Add runtime-owned mobile preview route. Success: `apps/mobile` contains a fixture-driven preview route that imports shared components and fixtures from `@repo/ui`. Progress note: `apps/mobile/app/(external)/ui-preview.tsx` now provides the first mobile preview route and is reachable from the external welcome screen in dev mode.
- [x] Task X - Add a first Maestro-aligned preview flow. Success: the mobile automation workspace includes a flow targeting the preview surface with stable selector IDs aligned to shared fixtures. Progress note: `apps/mobile/.maestro/flows/main/ui_preview.yaml` now validates the preview route using stable shared selector values.

## Phase 6: Documentation-Grounded Execution

- [x] Task S - Reference Storybook docs during web preview planning. Success: implementation decisions for `apps/web` preview hosting cite official Storybook configuration patterns rather than ad hoc structure.
- [x] Task T - Reference Playwright docs during web verification planning. Success: implementation decisions for Playwright config, projects, and runtime setup align with official Playwright guidance.
- [x] Task U - Reference Maestro docs during mobile verification planning. Success: implementation decisions for mobile flow organization, workspace management, and selector usage align with official Maestro guidance.
