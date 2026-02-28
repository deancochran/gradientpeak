# Technical Implementation Plan - Phase 5 Activity Plan Creation Redesign

Date: 2026-02-27
Status: Ready for implementation
Owner: Mobile + Core Logic + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `apps/mobile`:
  - refactor activity plan create/edit UX into one reusable in-place form screen
  - add inline validation and error placement logic
  - support interval and step editing without route redirects
- `packages/core` and/or existing plan estimation utilities:
  - provide/consume duration, TSS, and zone summary calculations for review step
- `packages/trpc` (if needed):
  - keep create/update payload contract stable for final submit path

## 2) Contract Lock Before Implementation

Lock these decisions before coding begins:

1. Create and edit must use a shared form component/logic path.
2. Authoring must be completed in one pushed screen (no multi-screen wizard).
3. Interval add/repeat/steps configuration is inline in same surface.
4. Validation is strict and submit-gating.
5. Inline errors are required at the field/section causing failure.

## 3) Workstreams

### A) Shared Create/Edit Form Foundation

- Identify current create and edit entry points and route both into a shared form implementation.
- Build one form state model reusable for create defaults and edit hydration.
- Preserve Android back and gesture behavior.

### B) Single-Screen Form Sections

- Implement required fields and validation for plan name and sport type.
- Keep optional metadata fields in same screen section.
- Keep all sections on one screen with optional expand/collapse behavior.

### C) Inline Interval and Step Authoring

- Implement interval list with empty prompt.
- Add interval inline from a single action.
- Enforce repeat count minimum and step presence before interval save.
- Add step editor with required duration/zone/type constraints in same screen context.
- Add reorder support (or maintain existing reorder behavior if already present).

### D) Summary + Save in Same Screen

- Build summary surface with structural overview in same screen.
- Integrate estimated totals via existing estimation pipeline.
- Gate final save on full validation pass.

### E) Legacy Path Cleanup

- Remove or demote legacy create/edit form divergence.
- Remove redirect-based sub-step paths from default authoring flow.
- Keep compatibility wrappers only if required temporarily, then remove.

## 4) Validation and Quality Gates

- `pnpm --filter mobile check-types`
- `pnpm --filter mobile test`
- Add/adjust targeted tests for creation flow validation and step transitions.

## 5) Test Strategy

- Shared form parity tests (create and edit render/behave through same component path).
- Interval constraints tests (repeat >= 1, at least one step).
- Submit gating tests (invalid structure blocked).
- Single-screen interaction tests (no route hops during interval/step authoring).
- Regression tests for existing creation contract payload.

## 6) Rollout Notes

- Deliver flow in sequence: shared foundation -> single-screen sections -> inline interval/step -> save.
- Keep payload schema compatibility stable until all callers are verified.
- Validate UX parity on both iOS and Android interaction patterns.
