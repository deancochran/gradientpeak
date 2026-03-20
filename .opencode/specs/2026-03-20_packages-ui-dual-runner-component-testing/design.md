# Design: Packages UI Dual-Runner Component Testing

## 1. Objective

Establish a durable shared UI testing architecture where every shared UI component in `packages/ui` has at least a basic component test for every supported platform, while keeping Playwright focused on web end-to-end behavior and Maestro focused on mobile end-to-end behavior.

This design builds on:

- `.opencode/specs/2026-03-19_turborepo-biome-ui-restructure/`
- `.opencode/specs/2026-03-20_packages-ui-testing-foundation/`
- `.opencode/specs/2026-03-20_packages-ui-single-package-architecture/`

## 2. Problem Statement

The repo now has a cleaner ownership model, but the active test lanes are still imbalanced.

Current issues:

- `packages/ui` actively runs web component tests, but native component tests are not part of a supported active runner,
- some native component test files exist, but they are not in a reliable, mainstream test path,
- not every shared component currently has explicit basic component coverage for its supported platform(s),
- Playwright and Maestro are correctly moving toward runtime E2E ownership, but package-level component coverage still needs to be completed,
- the repo needs a clean separation where component tests live in `packages/ui` and E2E tests live in the apps.

## 3. Architectural Decision

### A. `packages/ui` owns all shared component tests

Every shared component in `packages/ui/src/components` should have basic component coverage for every platform it supports.

That means:

- each `index.web.tsx` should have a basic web component test,
- each `index.native.tsx` should have a basic native component test,
- shared fixtures should continue to drive those tests where practical.

### B. Use separate mainstream runners per platform inside `packages/ui`

To keep the package shared while avoiding brittle cross-platform test infrastructure:

- web component tests should run with `Vitest` + `@testing-library/react`
- native component tests should run with `Jest` + `@testing-library/react-native`

This is the central architectural decision for testing.

`packages/ui` remains one package, but it uses two testing runtimes.

### C. Keep component tests basic and contract-focused

The purpose of `packages/ui` tests is to verify shared component contract confidence, not app behavior.

Basic component tests should cover:

- successful render,
- shared `testId` mapping,
- accessibility label/role where applicable,
- basic text/content rendering,
- simple interaction such as press/click/input,
- fixture-driven scenario rendering.

They should not cover:

- navigation,
- network behavior,
- full app state flows,
- gesture-heavy interactions,
- device integrations,
- browser or mobile app routing.

### D. Keep Playwright and Maestro purely E2E

#### `apps/web`

Playwright should focus on:

- route-level flows,
- form submissions,
- auth and session flows,
- page composition,
- runtime rendering of shared components inside the real app.

Playwright should not become the fallback for missing component tests.

#### `apps/mobile`

Maestro should focus on:

- navigation flows,
- login/user flows,
- runtime screen validation,
- preview route validation,
- device-level happy-path E2E behavior.

Maestro should not be used to replace basic shared component tests.

### E. Shared fixtures remain central

Shared fixtures in `packages/ui/src/components/<component>/fixtures.ts` remain the main reuse layer for:

- web component tests,
- native component tests,
- preview routes,
- Playwright E2E tests,
- Maestro selector/text alignment.

Fixtures should remain runtime-agnostic and serializable where practical.

### F. Coverage rule

Each component folder should follow this rule:

- if `index.web.tsx` exists, a `.web.test.tsx` should exist,
- if `index.native.tsx` exists, a `.native.test.tsx` should exist,
- smoke tests are acceptable for thin wrappers,
- richer contract tests are expected for interactive primitives.

### G. Native testing should use official React Native Testing Library patterns

Native package tests should:

- use `@testing-library/react-native`,
- use Jest as the runner,
- prefer accessible queries first,
- keep mocks targeted and minimal,
- avoid over-mocking the entire React Native runtime.

## 4. Target Testing Split

```text
packages/ui/
  vitest.config.ts        # web component tests only
  jest.config.ts          # native component tests only
  src/components/**
    index.web.test.tsx
    index.native.test.tsx

apps/web/
  e2e/                    # Playwright only

apps/mobile/
  .maestro/flows/         # Maestro only
```

## 5. Non-Goals

- Do not move shared UI component ownership out of `packages/ui`.
- Do not use Playwright to fill package-level component test gaps.
- Do not use Maestro to fill package-level component test gaps.
- Do not reintroduce package-native Vitest complexity if Jest can provide a cleaner native lane.
- Do not require gesture-heavy native component tests in this phase.

## 6. Success Criteria

- Every shared web component has a basic web component test.
- Every shared native component has a basic native component test.
- Web component tests run under `Vitest`.
- Native component tests run under `Jest`.
- Playwright remains focused on web E2E behavior.
- Maestro remains focused on mobile E2E behavior.
- Shared fixtures are reused consistently across component and runtime layers.

## 7. Documentation References

Implementation should use official tool guidance for runner setup and testing patterns.

### Web component testing

- Vitest docs for config, projects, setup files, and test execution
- Testing Library docs for React query priority and interaction guidance

### Native component testing

- Jest docs for configuration and environment setup
- React Native Testing Library docs for query priority, accessibility-first testing, and mocking guidance

### E2E testing

- Playwright docs for browser E2E config and projects
- Maestro docs for flow organization and workspace management
