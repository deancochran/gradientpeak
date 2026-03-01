# Tasks - Phase 5 Activity Plan Creation Redesign

Last Updated: 2026-02-27
Status: Active
Owner: Mobile + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [x] Lock shared create/edit form contract (single reusable component/logic path).
- [x] Lock one-screen authoring model (single push screen, no multi-screen wizard).
- [x] Lock inline interval/step configuration model.
- [x] Lock strict submit-gating validation rules.
- [x] Lock inline error surfacing requirement.

## 1) Current Flow Audit

- [x] Inventory current activity plan create/edit entry points and form implementations.
- [x] Identify divergent create vs edit logic that must be consolidated.
- [x] Identify legacy redirect paths to replace.
- [x] Confirm reusable architecture patterns from training plan create/edit form.

## 2) Shared Form Foundation

- [x] Implement shared form component used by both create and edit routes.
- [x] Implement shared form state model with create defaults and edit hydration.
- [x] Preserve safe dismissal/back behavior without route transitions.
- [x] Guard against accidental state loss during inline editing.

## 3) Single-Screen Basics Section

- [x] Implement required fields: plan name, sport/activity type.
- [x] Implement optional metadata fields.
- [x] Block save until basics validation passes.
- [x] Surface inline errors for missing/invalid basics.

## 4) Inline Interval and Step Authoring

- [x] Build interval list with empty-state guidance.
- [x] Implement add interval as a single inline action.
- [x] Enforce interval repeat count >= 1.
- [x] Enforce at least one step per interval before overall save.
- [x] Implement step editor with required non-zero duration and required zone/type inline.
- [x] Support multiple steps per interval in same screen context.
- [x] Support repeat configuration per interval in same screen context.
- [x] Add/retain interval reorder support.

## 5) Global Validation Rules

- [x] Enforce plan has >= 1 interval.
- [x] Enforce all intervals have >= 1 step.
- [x] Enforce all intervals repeat >= 1.
- [x] Enforce all steps duration > 0.
- [x] Enforce required basics present.

## 6) Summary and Save

- [x] Implement in-screen summary (duration, TSS, zone distribution, interval structure).
- [x] Gate final save button on full validation pass.
- [x] Preserve payload compatibility for create and update mutations.

## 7) Legacy Flow Cleanup and Consolidation

- [x] Remove legacy redirect-first creation paths from default UX.
- [x] Remove legacy edit form divergence from default UX.
- [x] Keep only required compatibility hooks (if temporary) with cleanup follow-up.

## 8) Tests

- [x] Add/update tests proving create and edit use same form component/logic.
- [x] Add/update tests for interval constraints.
- [x] Add/update tests for submit gating and inline errors.
- [x] Add/update tests ensuring no route hops during inline interval/step authoring.

## 9) Quality Gates

- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter mobile test`

## 10) Completion Criteria

- [x] All sections 0-9 complete.
- [x] `design.md` acceptance criteria satisfied.
- [x] New unified create/edit form is default and no invalid plans can be submitted.
