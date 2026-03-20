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

- [ ] Task M - Audit current package-owned preview assets. Success: all `packages/ui` preview-specific files, scripts, docs, and dependencies that must move, be deleted, or be replaced are listed before code changes begin.
- [ ] Task N - Define shared fixture rollout set. Success: a first-wave list of shared components that need `fixtures.ts` is documented with scope and expected consumers.
- [ ] Task O - Plan web preview hosting changes. Success: the exact target location, scripts, and dependencies for `apps/web` preview ownership are defined.
- [ ] Task P - Plan mobile preview hosting changes. Success: the exact target route or development entry strategy for `apps/mobile` preview ownership is defined.
- [ ] Task Q - Plan package test reduction. Success: existing `packages/ui` tests are categorized into keep, rewrite, move-up, or remove.
- [ ] Task R - Define selector/fixture export strategy for Playwright and Maestro. Success: the implementation approach for direct imports, constants, or generated artifacts is documented before automation changes begin.
