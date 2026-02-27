# Tasks - Phase 5 Activity Plan Creation Redesign

Last Updated: 2026-02-27
Status: Active
Owner: Mobile + Core Logic + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [ ] Lock staged flow: Basics -> Interval Builder -> Review.
- [ ] Lock in-place interaction model (sheet/modal/inline, no full-screen sub-step redirects).
- [ ] Lock strict submit-gating validation rules.
- [ ] Lock inline error surfacing requirement.

## 1) Current Flow Audit

- [ ] Inventory current activity plan creation entry points and sub-step routes.
- [ ] Identify legacy redirect paths to replace.
- [ ] Confirm reusable components from existing training plan creation UX.

## 2) Step Shell and State Machine

- [ ] Implement staged shell for three-step flow.
- [ ] Implement forward/back transitions with safe dismissal behavior.
- [ ] Guard against accidental state loss across step transitions.

## 3) Basics Step

- [ ] Implement required fields: plan name, sport/activity type.
- [ ] Implement optional metadata fields.
- [ ] Block step confirmation until basics validation passes.
- [ ] Surface inline errors for missing/invalid basics.

## 4) Interval Builder and Sub-Modal

- [ ] Build interval list with empty-state guidance.
- [ ] Implement add/edit interval sub-modal.
- [ ] Enforce interval repeat count >= 1.
- [ ] Enforce at least one step before interval save.
- [ ] Implement step editor with required non-zero duration and required zone/type.
- [ ] Add/retain interval reorder support.

## 5) Global Validation Rules

- [ ] Enforce plan has >= 1 interval.
- [ ] Enforce all intervals have >= 1 step.
- [ ] Enforce all intervals repeat >= 1.
- [ ] Enforce all steps duration > 0.
- [ ] Enforce required basics present.

## 6) Review and Save

- [ ] Implement review summary (duration, TSS, zone distribution, interval structure).
- [ ] Add edit shortcuts back to relevant sections.
- [ ] Gate final save button on full validation pass.
- [ ] Preserve payload compatibility for create mutation.

## 7) Legacy Flow Cleanup

- [ ] Remove legacy redirect-first creation paths from default UX.
- [ ] Keep only required compatibility hooks (if temporary) with cleanup follow-up.

## 8) Tests

- [ ] Add/update tests for step progression guards.
- [ ] Add/update tests for interval constraints.
- [ ] Add/update tests for submit gating and inline errors.
- [ ] Add/update tests for review edit shortcuts.

## 9) Quality Gates

- [ ] `pnpm --filter mobile check-types`
- [ ] `pnpm --filter mobile test`

## 10) Completion Criteria

- [ ] All sections 0-9 complete.
- [ ] `design.md` acceptance criteria satisfied.
- [ ] New creation flow is default and no invalid plans can be submitted.
