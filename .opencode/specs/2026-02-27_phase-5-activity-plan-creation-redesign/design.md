# Phase 5 Specification - Activity Plan Creation Redesign

Date: 2026-02-27
Owner: Mobile + Core Logic + QA
Status: Draft (implementation-ready)
Type: Mobile UX form unification refactor with strict validation

## Executive Summary

Phase 5 redesigns activity plan authoring into a single reusable form used by both create and edit flows, keeps the user in one screen context, enforces correctness before submit, and improves speed and clarity for building structured workouts.

The redesign changes interaction model and validation behavior, while preserving the underlying activity plan concept and compatibility with scheduling/template features.

## Scope

### In Scope

- Replace redirect-heavy and multi-surface authoring with one in-place form screen.
- Unify create and edit experiences so they use the same underlying form component and validation engine.
- Keep authoring on one push screen (no multi-screen wizard, no route-hopping during authoring).
- Enforce hard validation rules before final submission.
- Provide inline error surfacing at the field/section level.
- Keep flow consistent with existing mobile design language and component library.
- Support interval authoring inline: add interval once, then configure repeat count and steps directly in the form UI.

### Out of Scope

- Calendar scheduling UI behavior (Phase 6).
- Training template library UX (Phase 7).
- Recommendation engine behavior (Phase 8).
- New third-party UI dependencies.

## Problem Statement

- Current flow is not mobile-optimized and creates friction for plan creation.
- Invalid structures can be produced (empty intervals, repeat count below one, missing required basics).
- Create and edit behavior currently diverge, increasing maintenance and inconsistency risk.
- Validation and correction loops are not focused enough for small-screen interaction.

## Required Outcomes

1. User can complete create or edit without leaving one pushed screen.
2. Create and edit use an identical form model and interaction pattern.
3. Invalid plans cannot be submitted.
4. Validation feedback appears inline where the issue occurs.
5. Interval and step authoring are configurable in one form UI without additional navigation.

## Functional Requirements

### A) Unified Authoring Surface

- One form component powers both create and edit modes.
- Mode differences are data/submit intent only (create vs update), not separate UI architecture.
- Form sections are allowed (expand/collapse), but all editing remains in one pushed screen.

### B) Basics Section

- Capture: name (required), sport/activity type (required), difficulty/effort classification, optional duration override, optional notes.
- Save action remains disabled until required fields and global constraints are valid.
- Errors shown inline for missing/invalid required values.

### C) Interval Builder Section (Inline)

- Display interval list with empty-state guidance when no intervals exist.
- Support add/edit/reorder intervals.
- Adding intervals is a single inline action and does not navigate away.
- Repeat count and step list are configurable directly within interval UI.

#### Interval Configuration Requirements

- Interval repeat count is required and constrained to minimum 1.
- Interval section is invalid until at least one step exists.
- Step configuration captures: non-zero duration, target zone, step type, optional cadence target.

### D) Validation Rules (Must Hold Before Save)

- Plan has at least one interval.
- Every interval has at least one step.
- Every interval repeat count is >= 1.
- Every step duration is greater than zero.
- Name and sport type are present.

### E) Summary and Save

- Show summary information (duration, TSS, zone distribution, structure) within the same form screen.
- No separate review route/screen is required.
- Final save only enabled when all validation constraints pass.

## Non-Functional Requirements

- Mobile-first interaction performance (low-friction transitions, predictable back behavior).
- No new external UI libraries.
- Reuse existing components and tokens.
- Keep type safety for form state and payload construction.
- Mirror the training plan create/edit architectural approach for shared form reuse, without copying that UI design.

## Acceptance Criteria

1. Create and edit entry points render the same reusable form component.
2. Authoring is completed on one pushed screen with no multi-screen wizard/navigation hops.
3. Save is blocked until name/sport and all interval/step constraints are valid.
4. Intervals are added inline; repeat count and multiple steps are configured inline.
5. Submit is impossible when any validation rule fails.
6. Errors are inline and field/section specific.

## Exit Criteria

- `tasks.md` checklist complete.
- Mobile typecheck/tests for flow pass.
- No divergent create vs edit form implementations remain in active codepaths.
