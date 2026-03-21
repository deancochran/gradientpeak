# Design: Shared Input Library Extraction + Story Surface

## 1. Objective

Make `packages/ui` the source of truth for all reusable form inputs across web and mobile, including both foundational primitives and the domain-specific fitness inputs currently owned by `apps/mobile`.

Primary outcomes:

- every shared input component lives in `packages/ui`,
- each input component follows the `shared.ts` + `index.web.tsx` + `index.native.tsx` + `fixtures.ts` structure,
- web preview/docs can render the web implementation through Storybook,
- native-oriented fixtures are reusable in tests and any future mobile preview surface,
- app-local copies become thin wrappers or direct consumers instead of source owners.

## 2. Scope

### A. Primitive inputs

The shared library must fully own these input primitives:

- `switch`
- `checkbox`
- `select`
- `slider`
- `textarea`
- `radio-group`
- `file-input`
- `date-input`

### B. Domain fitness inputs

The shared library must also own reusable composed fitness inputs now defined in mobile:

- `bounded-number-input`
- `integer-stepper`
- `duration-input`
- `pace-input`
- `number-slider-input`
- `percent-slider-input`
- `pace-seconds-field`
- `weight-input-field`

## 3. Ownership Rules

- `shared.ts` stays runtime-agnostic and owns prop contracts, public types, and shared constants.
- `fixtures.ts` owns canonical example props and scenario data used by stories and tests.
- `index.web.tsx` owns browser rendering details and maps `testId` to `data-testid` where needed.
- `index.native.tsx` owns React Native rendering details and maps `testId` to `testID` where needed.
- app screens/forms remain app-owned; only reusable controls move into `packages/ui`.

## 4. Preview And Test Strategy

- `apps/web/.storybook` remains the active browser preview host and consumes stories colocated in `packages/ui`.
- Because there is no mobile Storybook runtime today, native fixture reuse is satisfied through component tests in `packages/ui` and wrapper-level app tests where useful.
- Every extracted input should have `fixtures.ts`, and those fixtures should be imported by its story, tests, or both.

## 5. Migration Strategy

1. Fill missing primitive folder contracts first.
2. Introduce new shared fitness inputs in `packages/ui`.
3. Convert legacy mobile input files into thin wrappers that re-export from `@repo/ui`.
4. Cut obvious web consumers like settings upload/toggle over to shared primitives.
5. Leave large app forms intact; they should compose shared inputs rather than move wholesale.

## 6. Non-Goals

- Do not move whole app forms into `packages/ui`.
- Do not block on a new native Storybook runtime.
- Do not duplicate domain screens solely to prove shared-input coverage.
