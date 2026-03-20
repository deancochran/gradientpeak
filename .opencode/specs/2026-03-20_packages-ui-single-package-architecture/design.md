# Design: Packages UI Single-Package Architecture

## 1. Objective

Keep all shared UI source ownership inside `packages/ui` while simplifying the architecture, reducing duplicate code, improving separation of concerns, and aligning preview/testing responsibilities with the actual web and mobile runtimes.

This design builds on:

- `.opencode/specs/2026-03-19_turborepo-biome-ui-restructure/`
- `.opencode/specs/2026-03-20_packages-ui-testing-foundation/`

## 2. Problem Statement

The current direction successfully centralized shared UI into `packages/ui`, but the testing and runtime story has become more complex than desired.

Key friction points:

- one package is currently trying to serve shared source ownership, web preview/docs, web tests, native tests, cross-platform selectors, and platform resolution all at once,
- native component tests are being pushed through a less standard tool path, which increases reliance on mocks and shims,
- the architecture needs to preserve code reuse without coupling web and native implementation details too tightly,
- a single web Storybook runtime cannot truthfully validate both `index.web.tsx` and `index.native.tsx`,
- shared test scenarios are needed across package tests, Playwright, and Maestro,
- the user explicitly prefers a more popular and reliable architecture over a novel or brittle one.

## 3. Architectural Decision

### A. Keep one shared UI package

All shared UI code remains in `packages/ui`.

This package remains the source of truth for:

- shared components,
- shared theme and tokens,
- shared testability conventions,
- shared fixtures and scenario builders,
- web and native component contracts.

The package should not be split into `ui-web` and `ui-native` at this time.

### B. Separate concerns inside the package, not across packages

The simplification should come from stronger internal boundaries.

Recommended boundaries:

1. `src/theme/` for tokens, theme sources, and generated theme artifacts
2. `src/lib/` for pure shared helpers and utilities
3. `src/components/<component>/shared.ts` for platform-agnostic contracts
4. `src/components/<component>/fixtures.ts` for shared scenarios and test data
5. `src/components/<component>/index.web.tsx` for web rendering
6. `src/components/<component>/index.native.tsx` for native rendering
7. colocated platform test files per component where package-level tests add value

### C. Keep `shared.ts` pure and minimal

`shared.ts` should own only cross-platform concerns:

- prop contracts,
- variants,
- slot naming conventions,
- shared selector/testability contracts,
- fixture-facing types where useful,
- shared TypeScript-only constants.

`shared.ts` must not import DOM or React Native runtime modules.

### D. Add shared fixtures as a first-class package concern

Each shared component can optionally own a `fixtures.ts` file containing plain TypeScript scenario data.

Fixtures should be:

- runtime-agnostic,
- serializable where practical,
- safe to import from web tests, native tests, previews, and app-level automation,
- free of DOM, React Native, Storybook, Playwright, and Maestro runtime dependencies.

Good fixture contents:

- canonical args/props,
- sample labels and copy,
- shared `testId` values,
- variant matrices,
- expected visible text,
- builder helpers for repeated scenarios.

Fixtures are the main reuse mechanism across platforms; stories are not.

### E. Platform files should own platform implementation details

#### `index.web.tsx`

Owns:

- web UI primitives,
- Radix/shadcn composition,
- web-only accessibility attributes,
- web-specific slot structure,
- mapping `testId -> data-testid`.

#### `index.native.tsx`

Owns:

- React Native / Reusables composition,
- native accessibility details,
- native-only slot structure,
- mapping `testId -> testID`.

This maintains a consistent public API while allowing platform-appropriate implementation.

### F. Preview environments should live with the apps, not the package

`packages/ui` should not own the preview runtime.

Instead:

- `apps/web` may host a web Storybook or web-only preview surface in development,
- `apps/mobile` may host a mobile preview route or native Storybook-style surface in development,
- both preview environments should import shared components and shared fixtures from `packages/ui`.

This keeps preview tooling close to the real runtime and avoids pretending that one browser-based preview can validate both platforms.

### G. Use platform-standard testing in the runtime-owning apps

To minimize complexity, testing should primarily follow runtime ownership.

Recommended test split:

- `packages/ui`: minimal package-level contract tests plus shared fixture ownership
- `apps/web`: web runtime verification with Playwright and optional web preview tests
- `apps/mobile`: mobile runtime verification with Maestro and targeted native test tooling where needed

Package-level tests remain useful for lightweight contract checks, but the main behavioral confidence should come from the owning runtime.

The main simplification is moving preview and high-confidence runtime verification out of the package and into the apps.

### H. Testing hierarchy

#### `packages/ui`

Owns shared source concerns for:

- prop and selector contracts,
- shared fixtures,
- shared `testId` mapping,
- slot naming conventions,
- lightweight package-level tests where they are easy and reliable.

#### `apps/web`

Owns:

- app composition,
- forms,
- route wiring,
- web preview/runtime docs,
- Playwright browser flows.

#### `apps/mobile`

Owns:

- screen integration,
- navigation,
- mobile preview/runtime docs,
- native-heavy runtime behavior,
- Maestro flows,
- future gestures, portals, and device-specific flows.

### I. Use shared selectors, but accessibility-first tests

The public shared testability contract remains:

- `testId`
- `id`
- `accessibilityLabel`
- `role`

But testing should prefer accessible queries first.

Query priority:

- `getByRole`
- `getByLabelText`
- `getByText`
- input-specific queries like `getByDisplayValue` / `getByPlaceholderText`
- `getByTestId` as an escape hatch for structural or repeated elements

### J. Avoid over-mocking native runtime behavior in package tests

The current pain strongly suggests that package-native tests should stay minimal and that native-heavy behavior should be verified in `apps/mobile`.

Guidelines:

- mock only native/runtime boundaries,
- do not mock the entire app architecture,
- do not over-mock shared UI internals,
- keep any package-native tests focused on component contract confidence,
- push native-heavy integration behavior upward into `apps/mobile`.

## 4. Recommended Target Structure

```text
packages/ui/
  package.json
  src/
    index.ts
    lib/
      cn.ts
      test-props.ts
      index.ts
    theme/
      new-york.json
      tokens.css
      web.css
      native.css
      native.ts
      index.ts
    test/
      setup-web.ts
      setup-native.ts
      render-web.tsx
      render-native.tsx
    components/
      button/
        shared.ts
        fixtures.ts
        index.web.tsx
        index.native.tsx
        index.web.test.tsx
        index.native.test.tsx
      input/
        ...
      card/
        ...

apps/web/
  .storybook/ or preview surface
  playwright/

apps/mobile/
  preview route or native Storybook-style surface
  maestro/
```

## 5. Required Repo Changes

This architecture implies the following concrete repo changes.

### A. `packages/ui`

- keep `packages/ui` as the only shared UI source package,
- add `fixtures.ts` to shared component folders where scenarios are reused,
- keep `shared.ts` as the canonical public contract file,
- reduce package tests to lightweight contract checks,
- remove package-owned preview assumptions and preview-specific docs/config over time.

### B. `apps/web`

- add or restore a web preview surface owned by `apps/web`,
- if Storybook is used, host `.storybook/` here instead of in `packages/ui`,
- import components and fixtures from `@repo/ui`,
- keep Playwright as the main web runtime verification layer,
- optionally use preview/stories as a manual design system surface, not the only test source.

### C. `apps/mobile`

- add or formalize a mobile preview route or native Storybook-style development surface,
- import components and fixtures from `@repo/ui`,
- keep Maestro as the main mobile runtime verification layer,
- keep any native-heavy integration tests in the mobile app rather than pushing them into package infrastructure.

### D. Shared Fixture Consumption Rules

- Playwright may import fixture files directly,
- package tests may import fixture files directly,
- mobile preview routes may import fixture files directly,
- Maestro should consume stable selector/text values derived from the same fixture contract, either through duplicated stable constants or a small generated artifact if needed,
- fixtures must remain plain TypeScript data/builders, not runtime-coupled rendering code.

### E. Preview Ownership Rules

- previews demonstrate runtime behavior,
- therefore preview ownership belongs to the runtime-owning app,
- `packages/ui` may provide examples and fixtures, but should not own the preview server itself.

## 6. Non-Goals

- Do not split shared UI into separate `ui-web` and `ui-native` packages in this phase.
- Do not force one preview runtime to represent both web and native truthfully.
- Do not require centralized Storybook ownership inside `packages/ui`.
- Do not duplicate component ownership across apps and package.
- Do not maximize reuse by introducing abstractions that reduce reliability.

## 7. Success Criteria

- Shared UI remains fully centralized in `packages/ui`.
- Internal boundaries inside `packages/ui` are explicit and sustainable.
- `shared.ts` files remain runtime-free and reusable.
- Shared fixtures are reusable across package tests, Playwright, Maestro, and preview environments.
- Web previews live with the web runtime.
- Mobile previews live with the mobile runtime.
- Runtime confidence comes from web and mobile runtime-owned verification instead of over-centralized package tooling.
- Shared selectors and component contracts remain consistent across platforms.
- The architecture reduces mocking complexity and increases maintainability.

## 8. Reference Documentation

Implementation should follow the official documentation for the runtime-owning tools:

### Storybook

- Storybook configuration docs for `main.ts`, `preview.ts`, stories globs, addons, and autodocs
- Storybook API docs for app-owned configuration files and preview behavior
- Use these docs when moving preview ownership into `apps/web`

Reference sources used:

- Storybook docs via Context7: `/storybookjs/storybook/v9.0.15`
- Relevant topics: configuration, `main.ts`, `preview.ts`, autodocs, stories globs, framework configuration, docs/autodocs

### Playwright

- Playwright docs for `playwright.config.ts`, projects, browser/device setup, `webServer`, retries, reporters, and test organization
- Use these docs when defining runtime-owned verification in `apps/web`

Reference sources used:

- Playwright docs via Context7: `/microsoft/playwright`
- Relevant topics: test configuration, projects, best practices, directory structure, web-first assertions, CI retries

### Maestro

- Maestro docs for flow organization, workspace management, CLI usage, YAML flows, JavaScript support, and test execution patterns
- Use these docs when defining runtime-owned verification and shared selector consumption in `apps/mobile`

Reference sources used:

- Maestro docs: `https://maestro.mobile.dev/`
- Relevant topics: quickstart, flows, JavaScript, workspace management, CLI, examples, troubleshooting
