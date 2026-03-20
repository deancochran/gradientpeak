# Design: Packages UI Testing Foundation

## 1. Objective

Establish a cross-platform testing foundation for the shared `@repo/ui` package so reusable components are testable, selector conventions are consistent across web and native, and test ownership is split cleanly between `packages/ui`, `apps/web`, and `apps/mobile`.

This work builds on the completed shared UI restructure in `.opencode/specs/2026-03-19_turborepo-biome-ui-restructure/`.

## 2. Current Repo Findings

- `packages/ui` owns shared components and Storybook, but it does not yet own any component tests or package-local test scripts.
- `apps/web` currently owns browser E2E coverage via Playwright, but not reusable shared primitive tests.
- `apps/mobile` has Vitest coverage, but many UI tests use `react-test-renderer` and local host mocks instead of a shared package-level testing contract.
- Shared components do not expose a normalized cross-platform test selector API; mobile code commonly uses `testID`, while web code would naturally use `data-testid`.
- Existing shared component `shared.ts` files are a natural place to define selector/testability contracts without leaking platform details into app code.

## 3. Design Decisions

### A. `packages/ui` owns reusable component testability

`packages/ui` becomes the source of truth for:

- shared selector prop contracts,
- shared component behavior tests,
- package-local test harness setup,
- test helper utilities for web and native component rendering.

Apps should not re-implement selector mapping logic for shared primitives.

### B. Standardize on one shared selector prop: `testId`

All shared components should expose a platform-neutral `testId` prop.

- Web maps `testId` to `data-testid`.
- Native maps `testId` to `testID`.

This keeps the public API consistent while preserving platform-correct underlying attributes.

### C. Normalize a minimal shared testability contract

The shared contract should stay small and explicit.

Recommended normalized props:

- `testId`
- `id`
- `accessibilityLabel`
- `role`

Mapping rules:

- web: `id -> id`
- native: `id -> nativeID`
- web: `accessibilityLabel -> aria-label`
- native: `accessibilityLabel -> accessibilityLabel`

`title` is not part of the cross-platform selector contract. It may still exist for specific web components, but it should not be the primary testing strategy.

### D. Keep normalization logic in one shared helper

Create a package-local helper under `packages/ui/src/lib/` that converts normalized testability props into platform-specific props.

This avoids repeating selector mapping logic in every component and keeps `shared.ts` focused on public prop ownership.

### E. Keep component tests colocated with components

Each shared component folder may own:

```text
packages/ui/src/components/button/
  shared.ts
  index.web.tsx
  index.native.tsx
  index.web.test.tsx
  index.native.test.tsx
  button.stories.tsx
```

Tests should live with the component they validate so future changes remain local and visible.

### F. Split responsibilities across package and apps

#### `packages/ui`

Owns primitive/component contract tests for:

- selector normalization,
- accessible rendering basics,
- variant/render behavior,
- simple interaction behavior,
- cross-platform parity where behavior should match.

#### `apps/web`

Owns:

- app composites,
- forms and page composition,
- Next-specific integration,
- Playwright browser flows.

It should not duplicate primitive tests already covered in `packages/ui`.

#### `apps/mobile`

Owns:

- screen composition,
- Expo Router/navigation behavior,
- native integration behavior,
- Maestro mobile flows,
- future gesture/device-specific testing.

It should not duplicate primitive contract tests that belong in `packages/ui`.

### G. Prefer accessibility queries first, `testId` second

Testing guidance for the repo:

- Prefer role, label, and text queries first.
- Use `testId` for repeated rows, structural wrappers, dynamic content, and E2E-stable hooks.
- Do not make `getByTestId` the default query for accessible controls like buttons, inputs, dialogs, switches, and tabs.

The shared `testId` contract is an escape hatch and a cross-platform consistency tool, not a replacement for accessible UI.

### H. Add package-local test harnesses for web and native

`packages/ui` should own its own test infrastructure rather than borrowing app-level config.

Recommended pieces:

- package-local test script(s),
- Vitest config in `packages/ui`,
- web setup file,
- native setup file,
- small render helpers in `packages/ui/src/test/`.

The package test harness should only depend on generic shared UI concerns, not app providers or app business logic.

## 4. Non-Goals

- Do not introduce gesture-heavy mobile tests in this phase.
- Do not migrate all app-level tests into `packages/ui`.
- Do not force `title` into the shared component contract as a primary selector strategy.
- Do not duplicate primitive tests across `packages/ui`, `apps/web`, and `apps/mobile`.
- Do not over-test class names, DOM structure, NativeWind output, or internal implementation details.

## 5. Target Structure

```text
packages/ui/
  package.json
  vitest.config.ts
  src/
    lib/
      cn.ts
      test-props.ts
    test/
      render-web.tsx
      render-native.tsx
      setup-web.ts
      setup-native.ts
      test-id.ts
    components/
      button/
        shared.ts
        index.web.tsx
        index.native.tsx
        index.web.test.tsx
        index.native.test.tsx
      input/
        ...
      card/
        ...
```

## 6. Validation Strategy

Focused validation should include:

- package-local `@repo/ui` tests,
- package-local typecheck,
- existing `apps/mobile` tests for integration confidence,
- existing `apps/web` browser checks where shared selectors become app-visible.

## 7. Success Criteria

- Shared components expose one normalized `testId` prop.
- Platform files consistently map that prop to web and native selectors.
- `packages/ui` owns its own component test harness and representative component tests.
- App-level tests rely on the shared contract rather than platform-specific ad hoc selector APIs.
- Responsibility boundaries are explicit and future shared components follow the same structure.
