---
name: ui-package
description: Shared @repo/ui component contracts, cross-platform exports, Storybook ownership, and package-level test boundaries
---

# UI Package Skill

## When to Use

- Editing shared components in `packages/ui`
- Adding or changing web/native exports or package-level helpers
- Working on Storybook stories, fixtures, or shared component tests

## Scope

This skill owns `@repo/ui` as a cross-platform package.

- Use `web-frontend` or `mobile-frontend` for app-specific consumption.
- Use `react-native-reusables-expert` for primitive implementation details.
- Use `testing` for broader coverage strategy.

## Rules

1. Keep exports and platform entrypoints explicit.
2. Prefer shared component contracts over app-local forks.
3. Treat Storybook as web preview infrastructure for package components, not app business logic.
4. Keep fixtures, stories, and tests close to the component surface they validate.
5. Preserve parity intentionally; platform divergence should be explicit, not accidental.

## Repo-Specific Guidance

- `packages/ui` owns shared component APIs, theme assets, and platform-specific export mapping.
- Web preview lives through `apps/web` Storybook while stories are largely package-owned.
- Use package-level tests to prove shared component behavior before relying on E2E coverage.
- `packages/ui` also owns the shared form interaction layer: `Form`, `useZodForm`, `useZodFormSubmit`, and the thin controlled wrappers under `components/form` and `components/form-fields`.
- Keep domain parsing, schemas, and calculations in `@repo/core`; `@repo/ui` should only own UI behavior, field composition, and RHF wiring.

## Shared Form Layer Rules

1. Add new shared field wrappers only when the same RHF pattern repeats across screens.
2. Prefer thin wrappers around existing shared inputs (`Input`, `Textarea`, `Select`, `DateInput`, `WeightInputField`, `IntegerStepper`) instead of embedding domain logic.
3. Export wrappers through `@repo/ui/components/form` so app consumers have one obvious import path.
4. Add package-level tests for each wrapper on web and native when practical.
5. Document raw `FormField` as the escape hatch for custom multi-control widgets.

## Avoid

- app-specific behavior leaking into shared primitives
- implicit export changes without updating consumers
- using Storybook as the only verification for shared components
- duplicating shared fixtures across apps

## Quick Checklist

- [ ] export map remains correct
- [ ] platform split is intentional
- [ ] stories/fixtures/tests updated together where needed
- [ ] component API stays reusable across apps
