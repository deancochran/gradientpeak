# Phase 5 Specification - Activity Plan Creation Redesign

Date: 2026-02-27
Owner: Mobile + Core Logic + QA
Status: Draft (implementation-ready)
Type: Mobile UX flow refactor with strict validation

## Executive Summary

Phase 5 redesigns activity plan creation into a mobile-first guided flow that stays in-place (sheet/modal driven), enforces correctness before submit, and improves speed and clarity for building structured workouts.

The redesign changes interaction model and validation behavior, while preserving the underlying activity plan concept and compatibility with scheduling/template features.

## Scope

### In Scope

- Replace redirect-heavy activity plan creation with sheet/modal/inline staged flow.
- Implement three-stage flow: Basics -> Interval Builder -> Review and Save.
- Enforce hard validation rules before final submission.
- Provide inline error surfacing at the field/section level.
- Keep flow consistent with existing mobile design language and component library.

### Out of Scope

- Calendar scheduling UI behavior (Phase 6).
- Training template library UX (Phase 7).
- Recommendation engine behavior (Phase 8).
- New third-party UI dependencies.

## Problem Statement

- Current flow is not mobile-optimized and creates friction for plan creation.
- Invalid structures can be produced (empty intervals, repeat count below one, missing required basics).
- Validation and correction loops are not focused enough for small-screen interaction.

## Required Outcomes

1. User can complete creation without leaving the initiating screen context.
2. The flow has clear staged progression with reversible edits.
3. Invalid plans cannot be submitted.
4. Validation feedback appears inline where the issue occurs.
5. Review step summarizes structure and supports targeted edits.

## Functional Requirements

### A) Step 1 - Activity Basics

- Capture: name (required), sport/activity type (required), difficulty/effort classification, optional duration override, optional notes.
- Confirmation disabled until required fields are valid.
- Errors shown inline for missing/invalid required values.

### B) Step 2 - Interval Builder

- Display interval list with empty-state guidance when no intervals exist.
- Support add/edit/reorder intervals.
- Opening add/edit interval uses a dedicated sub-modal.

#### Interval Sub-Modal Requirements

- Interval repeat count is required and constrained to minimum 1.
- Interval cannot be saved unless at least one step exists.
- Step configuration captures: non-zero duration, target zone, step type, optional cadence target.

### C) Validation Rules (Must Hold Before Save)

- Plan has at least one interval.
- Every interval has at least one step.
- Every interval repeat count is >= 1.
- Every step duration is greater than zero.
- Name and sport type are present.

### D) Step 3 - Review and Save

- Show complete structural summary before persistence.
- Show estimated totals (duration, TSS, zone distribution) using existing calculation pipeline.
- Provide edit shortcuts back to Basics and specific interval sections.
- Final save only enabled when all validation constraints pass.

## Non-Functional Requirements

- Mobile-first interaction performance (low-friction transitions, predictable back behavior).
- No new external UI libraries.
- Reuse existing components and tokens.
- Keep type safety for form state and payload construction.

## Acceptance Criteria

1. Creation flow remains on originating screen context using modals/sheets/inline expansion.
2. Basics step blocks progression until name and sport are valid.
3. Interval step blocks save for intervals with zero steps or invalid repeat counts.
4. Submit is impossible when any validation rule fails.
5. Review step provides structural summary and targeted edit shortcuts.
6. Errors are inline and field/section specific.

## Exit Criteria

- `tasks.md` checklist complete.
- Mobile typecheck/tests for flow pass.
- No legacy redirect path remains as default activity plan creation UX.
