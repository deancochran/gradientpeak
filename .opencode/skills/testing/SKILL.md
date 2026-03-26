---
name: testing
description: Test ownership, runner selection, and behavior-focused test patterns
---

# Testing Skill

## When to Use

- Adding or updating tests in any package or app
- Choosing between unit, component, integration, and E2E coverage
- Deciding which runner owns a behavior in this monorepo

## Scope

This skill is for test strategy and test shape.

- Use it to choose the right layer and avoid redundant coverage.
- Use package-specific skills for domain implementation details.

## Rules

1. Test observable behavior, not implementation details.
2. Pick the smallest test layer that proves the behavior.
3. Mock external boundaries, not stable internal logic.
4. Keep tests deterministic and independent.
5. Add edge cases and failure paths for meaningful logic.

## Repo-Specific Ownership

- `@repo/core`: unit tests for pure logic and schemas
- `@repo/trpc`: integration-style router and contract tests
- `@repo/ui`: component tests with `vitest` for web and `jest` for native
- `apps/web`: Playwright for web runtime and route-level E2E confidence
- `apps/mobile`: Maestro for mobile runtime and end-to-end flows
- For shared UI, default to `fixtures.ts` + Storybook `play` coverage first; use Playwright/Maestro only when proving app/runtime boundaries rather than component internals.
- Prefer generated selector and preview manifests over hand-authored runtime selector lists.

## Default Test Shape

```ts
describe("resolveTrainingTarget", () => {
  it("returns unavailable when power target lacks ftp", () => {
    expect(
      resolveTrainingTarget({
        target: { type: "power", value: 220 },
        ftp: undefined,
      }),
    ).toBe("unavailable");
  });
});
```

## Avoid

- Re-testing the same behavior at every layer
- Snapshot-heavy tests with weak assertions
- Over-mocking shared domain logic
- Using Playwright or Maestro to cover missing basic component tests

## Quick Checklist

- [ ] right test layer chosen
- [ ] happy path covered
- [ ] edge/failure states covered where relevant
- [ ] mocks limited to boundaries
- [ ] targeted verification run
