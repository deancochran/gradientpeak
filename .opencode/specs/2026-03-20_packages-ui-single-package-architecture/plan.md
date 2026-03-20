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

Current concrete targets:

- web preview host: `apps/web/.storybook/*`
- web preview scripts: `apps/web/package.json` owns `storybook` and `build-storybook`
- mobile preview host: `apps/mobile/app/dev/ui-preview.tsx` as the first target route, with optional child screens under `apps/mobile/app/dev/ui-preview/*` if the catalog grows

### Phase 4: Runtime-owned verification

- lean on Playwright for web runtime confidence,
- lean on Maestro for mobile runtime confidence,
- retain only the package-level tests that provide clear contract value,
- decide which existing package tests should be kept, rewritten, or removed.

Current reduction rubric:

- keep: lightweight web contract tests, selector mapping tests, and fixture-driven package tests that do not require heavy runtime shims
- rewrite: first-wave component tests to consume shared `fixtures.ts`
- move up: preview-driven interactions and runtime confidence checks into `apps/web` and `apps/mobile`
- remove: package-owned preview config/scripts and any package-native tests whose maintenance cost exceeds their contract value

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

Additional runtime guidance:

- `apps/web/.storybook/main.ts` and `apps/web/.storybook/preview.ts` should follow official Storybook config patterns
- `apps/web/playwright.config.ts` should continue to follow Playwright project/config guidance
- `apps/mobile/.maestro/flows/` remains the Maestro workspace root, using reusable flows and shared selectors aligned with Maestro workspace-management guidance

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

## 11. Documentation References For Implementation

Implementation work should consult the official docs directly while configuring each runtime surface.

### Web preview ownership (`apps/web`)

- Storybook official docs for `main.ts`, `preview.ts`, stories globs, docs/autodocs, addons, and Vite customization
- Use this reference when defining web preview hosting and any migrated Storybook config

### Web runtime verification (`apps/web`)

- Playwright official docs for config structure, `projects`, `webServer`, browser/device targets, retries, and test layout
- Use this reference when shaping Playwright around shared fixtures/selectors

### Mobile runtime verification (`apps/mobile`)

- Maestro official docs for workspace management, flow organization, CLI usage, YAML flows, nested flows, JavaScript helpers, and troubleshooting
- Use this reference when deciding how shared selector values are consumed by Maestro

### Practical implementation rule

- do not invent custom config patterns where the official docs already provide a supported structure,
- prefer official config names and directory conventions unless the repo has a strong reason to differ,
- keep the spec aligned with mainstream documented usage for maintainability.
