# Implementation Plan: Shared Input Library Extraction + Story Surface

## 1. Strategy

Implement the shared input cutover in five phases so the package gains reusable ownership first, then existing app code can consume it with minimal churn.

## 2. Planned File Areas

### Shared package

- `packages/ui/package.json`
- `packages/ui/src/components/index.ts`
- `packages/ui/src/components/{switch,checkbox,select,slider,textarea,radio-group}/`
- `packages/ui/src/components/{file-input,date-input}/`
- `packages/ui/src/components/{bounded-number-input,integer-stepper,duration-input,pace-input,number-slider-input,percent-slider-input,pace-seconds-field,weight-input-field}/`
- shared stories and tests beside those components

### App wrappers / consumers

- `apps/mobile/components/training-plan/create/inputs/*.tsx`
- `apps/mobile/components/profile/{WeightInputField.tsx,PaceSecondsField.tsx}`
- `apps/web/src/app/(internal)/settings/page.tsx`

## 3. Phase Plan

### Phase 1: Scope Lock + Spec Handoff

- archive the unrelated active spec from session focus,
- register the new shared-input spec,
- lock the extracted input list.

### Phase 2: Primitive Gap Fill

- add missing `index.web.tsx` files for current primitives,
- add `fixtures.ts` for each primitive,
- add web stories for browser-preview-safe primitives,
- update package exports so web resolves the web entrypoint.

### Phase 3: Domain Fitness Input Extraction

- create shared fitness input component folders,
- preserve reusable behavior from the mobile implementations,
- keep web renderers practical and browser-safe,
- keep native renderers compatible with current mobile screens.

### Phase 4: Fixture Reuse Surface

- wire stories to fixtures for web-previewable components,
- wire native tests to fixtures where mobile preview is unavailable,
- keep fixtures serializable and runtime-agnostic.

### Phase 5: Wrapper + Consumer Cutover

- replace mobile-local source ownership with thin re-exports,
- update targeted web consumers to use shared primitives,
- keep app forms behaviorally unchanged.

## 4. Validation

Focused validation should include:

- `pnpm --filter @repo/ui check-types`
- targeted `@repo/ui` web/native tests
- `pnpm --filter web check-types`
- `pnpm --filter mobile check-types`

If browser stories change materially, also run Storybook build for the web host.
