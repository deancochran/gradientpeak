# Tasks: Packages UI Dual-Runner Component Testing

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused verification passes, and the success check in the task text is satisfied.
- [ ] If blocked, leave the task unchecked and add the blocker inline.

## Phase 1: Spec Contract

- [x] Task A - Create dual-runner component-testing spec. Success: `design.md`, `plan.md`, and `tasks.md` exist under `.opencode/specs/2026-03-20_packages-ui-dual-runner-component-testing/` and define component-test ownership in `packages/ui` with E2E ownership in the apps.
- [x] Task B - Define platform runner split. Success: the spec explicitly assigns `Vitest` to web component tests and `Jest` to native component tests in `packages/ui`.
- [x] Task C - Define E2E boundaries. Success: the spec explicitly keeps Playwright web-only E2E and Maestro mobile-only E2E.

## Phase 2: Coverage Matrix Planning

- [x] Task D - Audit all web component exports. Success: every `index.web.tsx` in `packages/ui/src/components` is listed with a corresponding `.web.test.tsx` status in `.opencode/specs/2026-03-20_packages-ui-dual-runner-component-testing/coverage-matrix.md`.
- [x] Task E - Audit all native component exports. Success: every `index.native.tsx` in `packages/ui/src/components` is listed with a corresponding `.native.test.tsx` status in `.opencode/specs/2026-03-20_packages-ui-dual-runner-component-testing/coverage-matrix.md`.
- [x] Task F - Categorize test depth. Success: each shared component is categorized as smoke-test only, interactive primitive, or structural/composite primitive in `.opencode/specs/2026-03-20_packages-ui-dual-runner-component-testing/coverage-matrix.md`.

## Phase 3: Web Component Lane

- [x] Task G - Confirm web Vitest config. Success: `packages/ui/vitest.config.ts` is scoped cleanly to web component tests only.
- [x] Task H - Complete basic web component coverage. Success: every shared web component has a basic `.web.test.tsx` in `packages/ui`.
- [x] Task I - Standardize fixture-driven web tests. Success: first-wave and newly added web tests use shared fixtures where appropriate.

## Phase 4: Native Component Lane

- [x] Task J - Add native Jest config. Success: `packages/ui/jest.config.mjs` exists and runs native component tests with `@testing-library/react-native`.
- [x] Task K - Add native test setup. Success: `packages/ui/src/test/` contains Jest-native setup aligned with React Native Testing Library best practices.
- [x] Task L - Complete basic native component coverage. Success: every shared native component has a basic `.native.test.tsx` in `packages/ui`.
- [x] Task M - Remove brittle native Vitest dependency. Success: native component tests are no longer dependent on the inactive/brittle package-native Vitest path.

## Phase 5: Boundary Preservation

- [x] Task N - Keep Playwright E2E-focused. Success: `apps/web/e2e` remains runtime-route focused and does not replace package-level component tests.
- [x] Task O - Keep Maestro E2E-focused. Success: `apps/mobile/.maestro/flows` remains runtime-flow focused and does not replace package-level component tests.

## Phase 6: Validation

- [x] Task P - Run package web validation. Success: `pnpm --filter @repo/ui test:web` passes.
- [x] Task Q - Run package native validation. Success: `pnpm --filter @repo/ui test:native` passes.
- [ ] Task R - Run E2E validation. Success: relevant Playwright and Maestro flows pass after the component-test split is in place. Not run in this pass because the requested minimum verification scope was limited to `@repo/ui` typecheck plus web/native component lanes.
