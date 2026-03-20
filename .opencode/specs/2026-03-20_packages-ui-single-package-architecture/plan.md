# Implementation Plan: Packages UI Single-Package Architecture

## 1. Strategy

Refine the existing `packages/ui` architecture rather than splitting it into multiple packages.

The plan is to:

1. stabilize package boundaries,
2. formalize the internal directory structure,
3. introduce shared fixtures as the main reuse mechanism,
4. standardize component contracts around `shared.ts`,
5. move preview ownership to the runtime-owning apps,
6. reduce package-level testing complexity by leaning on Playwright and Maestro for runtime confidence.

## 2. Core Principles

- one package, many clearly separated concerns,
- shared contracts in TypeScript only,
- shared fixtures in TypeScript only,
- platform-specific rendering in dedicated files,
- previews live with the runtimes that own them,
- runtime confidence comes from runtime-native tools,
- reliability beats abstraction when there is a conflict.

## 3. Planned Package Shape

### A. Keep `packages/ui` as the single source of truth

Planned ownership inside `packages/ui`:

- component contracts,
- component implementations,
- shared fixtures,
- theme/tokens,
- selector conventions,
- lightweight package-level contract tests.

### B. Internal separation of concerns

#### `src/lib/`

Pure helpers only:

- `cn`
- `test-props`
- future shared utilities

#### `src/theme/`

Canonical theme/token ownership only.

#### `src/components/<component>/shared.ts`

Pure component contract ownership.

#### `src/components/<component>/fixtures.ts`

Pure shared scenarios and builders that can be reused by package tests, previews, Playwright, and Maestro.

#### `src/components/<component>/index.web.tsx`

Web rendering only.

#### `src/components/<component>/index.native.tsx`

Native rendering only.

#### `src/test/`

Minimal package-level helpers only for tests that truly belong in `packages/ui`.

## 4. Concrete Implementation Changes

### A. Move preview ownership out of `packages/ui`

Expected changes:

- remove or deprecate `packages/ui/.storybook/` as the long-term preview host,
- create or restore app-owned web preview config under `apps/web/`,
- create or formalize app-owned mobile preview entry points under `apps/mobile/`.

### B. Introduce shared fixtures in `packages/ui`

Expected changes:

- add `fixtures.ts` to representative component folders,
- standardize fixture exports so apps and tests can consume them predictably,
- document naming conventions for selectors, labels, and scenario builders.

### C. Rebalance testing ownership

Expected changes:

- keep only lightweight package-level tests in `packages/ui`,
- prefer Playwright for browser/runtime confidence,
- prefer Maestro for mobile/runtime confidence,
- remove or reduce brittle package-native test infrastructure where it no longer adds proportional value.

### D. Preserve current cross-platform component contract

Expected changes:

- keep `shared.ts` as the source of truth for public props,
- keep `testId` as the normalized shared selector prop,
- keep web/native renderer files colocated under each component.

## 5. Testing Plan

### Phase 1: Define shared fixtures as the central reuse layer

Shared fixtures should provide:

- stable `testId` values,
- canonical props,
- visible labels/copy,
- variant/state examples,
- serializable scenario data when possible.

These fixtures should be usable by:

- package tests,
- web preview/stories,
- Playwright,
- mobile preview routes,
- Maestro through stable shared selector/value conventions.

### Phase 2: Web preview and runtime testing live in `apps/web`

`apps/web` should own:

- web preview tooling such as Storybook if used,
- browser/runtime verification with Playwright,
- any preview-driven web interaction testing.

`packages/ui` can still keep selective web component tests, but preview ownership should no longer be package-owned.

### Phase 3: Mobile preview and runtime testing live in `apps/mobile`

`apps/mobile` should own:

- mobile preview routes or native Storybook-style development surfaces,
- Maestro flows,
- native runtime verification,
- any heavier native-specific integration tests.

`packages/ui` can still keep selective native contract tests if reliable, but native-heavy behavior should not be forced into package infrastructure.

### Phase 4: Clarify app boundaries

#### `apps/web`

- keep app integration, preview tooling, and Playwright coverage there.

#### `apps/mobile`

- keep integration, navigation, preview tooling, and Maestro/device workflow coverage there.

## 6. Rollout Phases

### Phase 1: Architecture contract

- document the target single-package architecture,
- define acceptable responsibilities for fixtures, previews, and runtime-owned tests,
- define component folder expectations.

### Phase 2: Shared fixture rollout

- add fixture files where needed,
- standardize fixture content and naming,
- document how fixtures are consumed by tests and previews,
- identify any Maestro-facing values that need constant or generated output support.

### Phase 3: Preview ownership shift

- move or plan Storybook/preview ownership into `apps/web`,
- plan mobile preview ownership inside `apps/mobile`,
- stop treating preview tooling as a `packages/ui` concern,
- define the migration path for any existing package-owned preview files.

### Phase 4: Runtime-owned verification

- lean on Playwright for web runtime confidence,
- lean on Maestro for mobile runtime confidence,
- retain only the package-level tests that provide clear contract value,
- decide which existing package tests should be kept, rewritten, or removed.

### Phase 5: Package test reduction and cleanup

- simplify package-level test infrastructure,
- remove over-centralized or misleading preview/testing assumptions,
- keep selectors and shared contract tests where useful,
- remove stale docs/scripts/config that still assume package-owned Storybook.

### Phase 6: Validation and cleanup

- run package-level validation,
- run Playwright and Maestro flows using shared selectors/fixtures,
- update docs for future component authors and app preview owners,
- verify that the package, web preview, and mobile preview all consume the same fixture contract successfully.

## 7. Proposed Config Ownership

- `packages/ui` for shared source, selectors, and fixtures
- `apps/web` for preview tooling and Playwright config
- `apps/mobile` for preview tooling and Maestro config
- package test config only where package-level tests remain valuable

## 8. Implementation File Targets

Expected touched paths during implementation will likely include:

- `packages/ui/src/components/**/shared.ts`
- `packages/ui/src/components/**/fixtures.ts`
- `packages/ui/src/components/**/*.web.test.tsx`
- `packages/ui/src/components/**/*.native.test.tsx`
- `packages/ui/src/test/*`
- `packages/ui/package.json`
- `apps/web/.storybook/*` or equivalent web preview files
- `apps/web/package.json`
- `apps/mobile/app/**` preview entry points or equivalent mobile preview files
- `apps/mobile/package.json`
- Playwright specs that consume shared selectors/fixtures
- Maestro flows or generated constants that consume shared selectors/fixtures

## 9. Validation Targets

Expected validation surface:

```bash
pnpm --filter @repo/ui check-types
pnpm --filter @repo/ui test
pnpm --filter web test:e2e
maestro test <relevant mobile flow>
```

App-level validation remains separate where needed.

## 10. Rollout Notes

- This is a refinement, not a reversal, of the `packages/ui` strategy.
- The main change is promoting shared fixtures and runtime-owned previews/tests over package-owned preview complexity.
- Future shared components should be added only if their `shared.ts` contract stays pure, their fixtures stay runtime-agnostic, and their platform implementations stay isolated.
