# Technical Implementation Plan - Phase 5 Activity Plan Creation Redesign

Date: 2026-02-27
Status: Ready for implementation
Owner: Mobile + Core Logic + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `apps/mobile`:
  - refactor activity plan creation UX into staged modal/sheet flow
  - add inline validation and error placement logic
  - support interval and step editing without route redirects
- `packages/core` and/or existing plan estimation utilities:
  - provide/consume duration, TSS, and zone summary calculations for review step
- `packages/trpc` (if needed):
  - keep create/update payload contract stable for final submit path

## 2) Contract Lock Before Implementation

Lock these decisions before coding begins:

1. Creation flow is staged: Basics -> Interval Builder -> Review.
2. The flow remains in current screen context (sheet/modal/inline), not full-screen redirects for sub-steps.
3. Validation is strict and submit-gating.
4. Inline errors are required at the field/section causing failure.

## 3) Workstreams

### A) UX Surface Refactor

- Identify current creation entry point and split into staged internal state machine.
- Implement step shell with forward/back progression.
- Preserve Android back and gesture behavior.

### B) Basics Step

- Implement required fields and validation for plan name and sport type.
- Keep optional metadata fields in same step.
- Block progression until basics valid.

### C) Interval Builder + Interval Sub-Modal

- Implement interval list with empty prompt.
- Add/edit interval sub-modal.
- Enforce repeat count minimum and step presence before interval save.
- Add step editor with required duration/zone/type constraints.
- Add reorder support (or maintain existing reorder behavior if already present).

### D) Review and Save

- Build summary surface with structural overview.
- Integrate estimated totals via existing estimation pipeline.
- Add edit shortcuts that deep-link back to relevant creation section.
- Gate final save on full validation pass.

### E) Legacy Path Cleanup

- Remove or demote legacy redirect-based sub-step paths from default creation flow.
- Keep compatibility wrappers only if required temporarily, then remove.

## 4) Validation and Quality Gates

- `pnpm --filter mobile check-types`
- `pnpm --filter mobile test`
- Add/adjust targeted tests for creation flow validation and step transitions.

## 5) Test Strategy

- Step progression tests (cannot advance when required fields missing).
- Interval constraints tests (repeat >= 1, at least one step).
- Submit gating tests (invalid structure blocked).
- Review shortcut tests (edit links route to correct section).
- Regression tests for existing creation contract payload.

## 6) Rollout Notes

- Deliver flow in sequence: shell -> basics -> interval builder -> review.
- Keep payload schema compatibility stable until all callers are verified.
- Validate UX parity on both iOS and Android interaction patterns.
