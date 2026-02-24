# Design: Training Plan Create/Edit Parity (Shared Composer)

Date: 2026-02-22
Owner: Mobile + tRPC + Core Planning
Status: Proposed
Type: UX/Architecture Consolidation

## Executive Summary

Unify training plan create and edit into one shared experience so users learn one workflow once.
Create and Edit should be nearly identical in UI/UX, with differences only in mode-level behavior
(header copy, CTA text, and persistence action).

This change preserves existing defaults and keeps advanced controls available. It removes the
current split mental model where Create uses the modern configuration flow while Edit relies on
a separate settings-style structure editor.

## Problem

Current state introduces user friction through divergence:

- Create uses `SinglePageForm` and config preview pipeline.
- Edit is routed through a distinct settings page with raw structure mutations.
- Users must learn two workflows for the same conceptual task.
- Edit does not consistently reuse creation safety/feasibility semantics.

## Goals

1. Create and Edit are visually and behaviorally near-identical.
2. Preserve current default values and UX quality in Create.
3. Reuse existing preview/safety/conflict pipeline in Edit.
4. Ensure editing only affects training plan structure (future plan logic), not historical activities.
5. Keep power-user controls available; no capability loss.

## Non-Goals

- No change to historical completed activity records.
- No rewrite of core projection science logic.
- No database schema migration required.
- No removal of advanced controls or calibration capability.

## Key Product Decisions

1. Single shared composer UI
   - `SinglePageForm` remains core surface for both modes.

2. Mode-specific differences only
   - Create: seeds from suggestions/defaults, persists via create mutation.
   - Edit: seeds from existing plan + metadata, persists via update-from-config mutation.

3. Future-plan regeneration semantics
   - Save in Edit recomputes plan structure from current input.
   - Past activities remain untouched (training history integrity preserved).

4. Review parity
   - Same review, blockers, override policy semantics across create/edit.

## User Experience Model

- One route family for composer experience:
  - Create route: "Create Training Plan"
  - Edit route: "Edit Training Plan"
- Same tabs and controls, same defaults and helper copy.
- Same forecast behavior and conflict surfacing.
- CTA label differs by mode: `Create` vs `Save changes`.

## Technical Approach

### 1) Shared Composer Container

Extract orchestration from create screen into a reusable container with `mode: "create" | "edit"`:

- shared state management
- shared preview scheduling
- shared validation + blocker logic
- mode-specific load/save adapters

### 2) Edit Initialization Adapters

Add reverse adapters from existing `training_plan.structure` to:

- `TrainingPlanFormData`
- `TrainingPlanConfigFormData`

Rules:

- Use persisted creation metadata when present.
- Fallback to current defaults/suggestions when metadata missing.
- Preserve deterministic mapping for round-trip stability.

### 3) New Edit Persistence Mutation

Add `updateFromCreationConfig` API path that mirrors create pipeline:

- evaluate creation config
- run projection + conflict derivation
- apply override policy
- validate structure
- update existing plan record

Invariants:

- plan `id` preserved
- historical activities unchanged
- active state behavior unchanged unless explicitly edited

### 4) Route + Entry Point Unification

- Add edit route pointing to shared composer in edit mode.
- Retain settings page for lifecycle actions (activate/deactivate/delete/basic metadata), not primary structure authoring.

## Data Integrity & Safety Invariants

1. No writes to `activities` during edit save.
2. No mutation of completed activity history.
3. `training_plans.structure` is the primary edited artifact.
4. Existing validation and blocker semantics enforced pre-save.
5. Preview token staleness rules retained for edit save where applicable.

## Acceptance Criteria

1. Create and Edit render same composer UI and control model.
2. Edit initializes from existing plan with sensible fallback defaults.
3. Edit save runs same safety/conflict checks as create.
4. Saving Edit updates training plan structure only; history remains intact.
5. Existing create behavior remains unchanged.
6. Existing defaults and advanced controls remain available.
7. No regression in contract compatibility for current create endpoints.

## Risks & Mitigations

- Risk: Reverse adapter ambiguity from legacy structures.
  - Mitigation: Metadata-first mapping + fallback defaults + explicit unknown handling tests.
- Risk: Drift between create and edit logic over time.
  - Mitigation: Single shared container + parity tests.
- Risk: User confusion around what edit save changes.
  - Mitigation: Clear copy: "Updates future plan structure; does not alter completed activities."
