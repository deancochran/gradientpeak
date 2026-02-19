# Training Plan Schema Hard Update (Goals and Targets V2)

Last Updated: 2026-02-10
Status: Draft for implementation planning
Owner: Product + Core + Backend + Mobile

## 1) Purpose

This spec defines a hard schema update for training plan goals and targets.

- This update is intentionally not backward compatible.
- Existing goal schema contracts are replaced, not extended.
- Training plans must always contain meaningful, machine-usable target definitions.

## 2) Problem Statement

Current goal capture allows under-specified goals and optional target detail, which weakens:

- TSS planning reliability
- feasibility and safety interpretation quality
- consistency of downstream category inference

The system must require structured target intent so each training plan has actionable outcome definitions.

## 3) Product Requirements

1. A training plan must have multiple goals capability, with at least one goal required.
2. Every goal must have multiple targets capability, with at least one target required.
3. Every target must declare a `target_type`.
4. Supported target types for this phase:
   - `race_performance`
   - `pace_threshold`
   - `power_threshold`
   - `hr_threshold`
5. `multisport_event`, triathlon-specific logic, and segment-based multisport targets are out of scope.
6. Activity categories must be derived from all goal targets in the plan.
7. No user-entered plan-level activity categories are required.
8. `pace_threshold` must include mandatory associated time.
9. `power_threshold` must include mandatory associated time.

## 4) Non-Goals

- No multisport or triathlon modeling in this phase.
- No legacy schema compatibility layer.
- No dual-read or dual-write behavior for old goal structures.
- No migration shim that interprets prior `metric` payloads.

## 5) Hard-Break Contract Policy

This is a hard update.

- Old goal payloads are invalid under V2 contract.
- API input/output for training plan create/update/preview must use V2 goals/targets.
- Validation must reject legacy single-metric goal structures.
- Mobile create/edit flows must emit only V2 payloads.

## 6) Domain Model V2

### 6.1 Training Plan

- `goals: GoalV2[]` is required with `min(1)`.

### 6.2 GoalV2

- `id` (uuid)
- `name` (required)
- `target_date` (required, date only)
- `priority` (required 1-10)
- `targets: GoalTargetV2[]` (required, `min(1)`)

### 6.3 GoalTargetV2 (discriminated union by `target_type`)

#### a) `race_performance`

- `target_type: "race_performance"`
- `distance_m` (required, > 0)
- `target_time_s` (required, > 0)

#### b) `pace_threshold`

- `target_type: "pace_threshold"`
- `target_speed_mps` (required, > 0)
- `test_duration_s` (required, > 0) // mandatory associated time

#### c) `power_threshold`

- `target_type: "power_threshold"`
- `target_watts` (required, > 0)
- `test_duration_s` (required, > 0) // mandatory associated time

#### d) `hr_threshold`

- `target_type: "hr_threshold"`
- `target_lthr_bpm` (required, > 0)

## 7) Input and Unit Rules

User-facing input formats:

- Distance: kilometers (`km`)
- Completion time: `h:mm:ss`
- Pace: `mm:ss`

Normalized storage/calculation units:

- `distance_m`
- `target_time_s`
- `target_speed_mps`
- `test_duration_s`

Conversion policy:

- Parsing and normalization must occur before schema persistence.
- Invalid formatted time/pace values are rejected at validation boundary.

## 8) Activity Category Derivation

Plan-level categories are derived from all targets:

- `race_performance` and `pace_threshold` contribute endurance category signals.
- `power_threshold` contributes power category signals.
- `hr_threshold` contributes aerobic category signals.

Implementation requirement:

- Derivation logic is centralized and deterministic.
- No plan-level category field is required in create/update payloads.

Note: target-specific category hints may still be used internally where needed for disambiguation, but manual plan-level category selection is removed from user workflow.

## 9) Validation Requirements

1. Training plan invalid if `goals.length === 0`.
2. Goal invalid if `targets.length === 0`.
3. Target invalid if `target_type` missing or unknown.
4. `pace_threshold` invalid without mandatory time (`test_duration_s`).
5. `power_threshold` invalid without mandatory time (`test_duration_s`).
6. Reject any multisport/triathlon target type.
7. Reject legacy goal payload fields that attempt old schema shapes.

## 10) API and UX Implications

API:

- Training plan create/update/preview contracts move to V2.
- Error messaging must be explicit and path-specific for invalid goals/targets.

Mobile UX:

- Goal builder supports adding/removing multiple goals.
- Each goal includes a target builder supporting multiple targets.
- Target type picker is required per target row.
- Type-specific required fields appear immediately after type selection.
- No multisport target option displayed.

## 11) Rollout and Release Policy

- Ship as a coordinated hard cutover across core schemas, tRPC inputs, and mobile create/edit flows.
- Do not implement backward-compat parsing.
- If old persisted plans must be handled operationally, treat that as separate data lifecycle work (outside this spec).

## 12) Acceptance Criteria

1. New training plan cannot be created without at least one goal.
2. New goal cannot be created without at least one target.
3. Pace and power threshold targets fail validation when associated time is missing.
4. Multisport/triathlon target types are not available and are rejected by API validation.
5. Activity categories used by planning are fully derived from submitted goals/targets.
6. No create/update path accepts legacy single-metric goal payloads.
