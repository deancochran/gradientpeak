# Implementation Plan: Packages UI Testing Foundation

## 1. Strategy

Implement the testing foundation in six phases:

1. define ownership and selector conventions,
2. add shared test-prop normalization helpers,
3. add `packages/ui` package-local test infrastructure,
4. adopt the normalized contract across representative shared primitives,
5. add package-local cross-platform component tests,
6. align app-level usage and validation.

This plan intentionally keeps reusable primitive tests in `packages/ui` and leaves app composition, routing, and platform workflow tests in `apps/web` and `apps/mobile`.

## 2. Target Responsibilities

### `packages/ui`

- owns normalized selector contract,
- owns package-local test helpers and setup,
- owns primitive/component tests,
- owns documentation for selector and testing conventions.

### `apps/web`

- owns app integration tests,
- owns browser E2E coverage,
- consumes normalized shared selectors where needed.

### `apps/mobile`

- owns screen/native integration tests,
- owns Maestro flows,
- consumes normalized shared selectors where needed.

## 3. Planned File Changes

### A. New spec bundle

- `.opencode/specs/2026-03-20_packages-ui-testing-foundation/design.md`
- `.opencode/specs/2026-03-20_packages-ui-testing-foundation/plan.md`
- `.opencode/specs/2026-03-20_packages-ui-testing-foundation/tasks.md`

### B. `packages/ui` infrastructure

- `packages/ui/package.json`
- `packages/ui/vitest.config.ts`
- `packages/ui/src/lib/index.ts`
- `packages/ui/src/lib/test-props.ts`
- `packages/ui/src/test/setup-web.ts`
- `packages/ui/src/test/setup-native.ts`
- `packages/ui/src/test/render-web.tsx`
- `packages/ui/src/test/render-native.tsx`
- `packages/ui/src/test/test-id.ts`

### C. Shared component contract adoption

Representative first-wave shared components:

- `packages/ui/src/components/button/*`
- `packages/ui/src/components/input/*`
- `packages/ui/src/components/card/*`
- `packages/ui/src/components/switch/*`
- `packages/ui/src/components/tabs/*`

### D. Package-local component tests

Representative first-wave tests:

- `packages/ui/src/components/button/index.web.test.tsx`
- `packages/ui/src/components/button/index.native.test.tsx`
- `packages/ui/src/components/input/index.web.test.tsx`
- `packages/ui/src/components/input/index.native.test.tsx`
- `packages/ui/src/components/card/index.web.test.tsx`
- `packages/ui/src/components/card/index.native.test.tsx`

### E. App adoption touchpoints

Potential app touchpoints for normalized usage examples:

- `apps/web` test files that need stable shared selectors
- `apps/mobile` existing screen/component tests currently using direct `testID` conventions around shared primitives

## 4. Phase Plan

### Phase 1: Ownership and selector policy

Define and document:

- what belongs in `packages/ui` versus apps,
- when to use accessibility queries versus `testId`,
- which normalized props are part of the shared API,
- naming conventions for shared selector values.

### Phase 2: Shared helper foundation

Add a package-local helper that normalizes:

- `testId`
- `id`
- `accessibilityLabel`
- `role`

The helper should expose one web mapping function and one native mapping function.

### Phase 3: `packages/ui` test harness

Add package-local test tooling so `@repo/ui` can run independently.

Recommended setup:

- package-local `test` script,
- package-local `vitest.config.ts`,
- minimal setup files for web and native,
- render helpers for both environments.

### Phase 4: First-wave component adoption

Adopt the new helper and `testId` contract in a small but representative cross-platform component set:

- `button`
- `input`
- `card`
- `switch`
- `tabs`

Selection criteria:

- commonly consumed by both apps,
- representative of interactive and structural primitives,
- valuable as testing examples for future components.

### Phase 5: Package-local component tests

Write colocated tests for first-wave components.

Coverage focus:

- selector normalization,
- accessible render basics,
- disabled/basic interaction behavior,
- package export-level confidence.

Do not over-scope into app business logic or gesture/device-specific behavior.

### Phase 6: App boundary alignment and validation

Update app-level examples and validation rules so apps consume shared selectors without redefining the contract.

Expected outcomes:

- one web example using resulting `data-testid`,
- one mobile example using resulting `testID`,
- validation commands documented for `@repo/ui`, web, and mobile.

## 5. Testing Guidance to Enforce

- Prefer `getByRole`, `getByLabelText`, and `getByText` first.
- Use `testId` for repeated rows, wrappers, dynamic content, and E2E-safe hooks.
- Avoid asserting Tailwind/NativeWind classes as core behavior.
- Avoid snapshot-heavy testing for shared primitives.
- Test public behavior and selector contract, not Radix or RN primitive internals.

## 6. Validation Commands

Focused validation target:

```bash
pnpm --filter @repo/ui check-types
pnpm --filter @repo/ui test
pnpm --filter mobile test
pnpm --filter web test:e2e
```

The narrowest relevant subset should run first during implementation.

## 7. Rollout Notes

- Begin with representative shared primitives, then expand to the rest of `packages/ui`.
- Future shared components should add `testId` support and colocated tests as part of their definition of done.
- Existing app-level tests can be updated opportunistically where selector consistency matters most.
