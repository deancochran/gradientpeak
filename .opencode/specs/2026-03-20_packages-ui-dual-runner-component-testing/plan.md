# Implementation Plan: Packages UI Dual-Runner Component Testing

## 1. Strategy

Complete shared component coverage in `packages/ui` by introducing a stable dual-runner model:

1. keep web component tests on `Vitest`,
2. introduce native component tests on `Jest`,
3. ensure every shared component has at least a basic platform-appropriate test,
4. keep Playwright and Maestro restricted to E2E scope.

## 2. Core Principles

- component tests live in `packages/ui`,
- runtime/E2E tests live in the apps,
- one runner per platform,
- fixtures are shared across layers,
- accessibility-first queries preferred,
- smoke tests are acceptable for simple wrappers.

## 3. Planned Testing Ownership

### `packages/ui`

- web component tests
- native component tests
- shared fixtures
- test helpers and setup files

### `apps/web`

- Playwright browser/runtime flows only

### `apps/mobile`

- Maestro mobile/runtime flows only

## 4. Concrete Implementation Changes

### A. Web test lane

- keep `packages/ui/vitest.config.ts` scoped to web component tests,
- ensure every web-exported component has a `.web.test.tsx`,
- add or expand smoke tests for thin web wrappers.

### B. Native test lane

- add `packages/ui/jest.config.ts`,
- add or refine native setup under `packages/ui/src/test/`,
- migrate existing native tests to Jest + React Native Testing Library,
- ensure every native-exported component has a `.native.test.tsx`.

### C. Coverage audit and closure

- map every `index.web.tsx` to a `index.web.test.tsx`,
- map every `index.native.tsx` to a `index.native.test.tsx`,
- decide which tests can be smoke-only and which need richer assertions.

### D. E2E boundary preservation

- keep `apps/web/e2e` limited to route/runtime flows,
- keep `apps/mobile/.maestro/flows` limited to runtime flows,
- do not duplicate package-level component assertions in E2E suites.

## 5. Rollout Phases

### Phase 1: Native runner foundation

- add Jest config for `packages/ui`,
- add native setup file(s),
- align test environment with React Native Testing Library guidance,
- remove reliance on inactive native Vitest coverage.

### Phase 2: Coverage matrix

- audit all web and native components,
- create a coverage matrix of supported platforms vs test files,
- categorize components into:
  - smoke-test only,
  - interactive primitive,
  - structural/composite primitive.

### Phase 3: Web coverage completion

- add missing `.web.test.tsx` files,
- standardize fixture-driven test patterns,
- keep tests concise and contract-focused.

### Phase 4: Native coverage completion

- add or migrate `.native.test.tsx` files to Jest,
- standardize query patterns and minimal mocks,
- cover render, selector mapping, and simple interaction.

### Phase 5: Cleanup and validation

- remove obsolete native Vitest assumptions,
- confirm `packages/ui` web and native test commands pass,
- verify E2E suites remain scoped correctly.

## 6. Target Commands

Expected package/runtime commands after implementation:

```bash
pnpm --filter @repo/ui test:web
pnpm --filter @repo/ui test:native
pnpm --filter web test:e2e
pnpm --filter mobile test:e2e
```

Optionally:

```bash
pnpm --filter @repo/ui test
```

as a composite package command that runs both component lanes.

## 7. Implementation File Targets

Likely touched paths:

- `packages/ui/package.json`
- `packages/ui/vitest.config.ts`
- `packages/ui/jest.config.ts`
- `packages/ui/src/test/*`
- `packages/ui/src/components/**/*.web.test.tsx`
- `packages/ui/src/components/**/*.native.test.tsx`
- `apps/web/e2e/*` for boundary cleanup only if needed
- `apps/mobile/.maestro/flows/*` for boundary cleanup only if needed

## 8. Validation Targets

```bash
pnpm --filter @repo/ui check-types
pnpm --filter @repo/ui test:web
pnpm --filter @repo/ui test:native
pnpm --filter web test:e2e
pnpm --filter mobile test:e2e
```

## 9. Rollout Notes

- This is not a reversal of the simplified architecture.
- It restores full shared component coverage without collapsing E2E boundaries.
- The main change is adding a proper native component-test lane instead of relying on the old brittle setup.
