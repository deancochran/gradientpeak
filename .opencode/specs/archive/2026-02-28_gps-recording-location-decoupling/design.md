# Specification - Hard Cutover to GPS-Only Recording Semantics

Date: 2026-02-28
Owner: Mobile + Core + tRPC + Supabase + Integrations + QA
Status: Draft (implementation-ready)
Type: Cross-package breaking domain correction

## Executive Summary

`activity_location` is removed from the database and from all application contracts. Recording behavior is controlled only by GPS runtime state in the mobile recorder.

This is a hard cutover. No backward compatibility paths, aliases, fallback transforms, or dual-field operation are allowed.

## Problem Statement

The current model uses `indoor/outdoor` as a proxy for recording behavior. That conflates metadata with control flow and causes complexity in recorder runtime, API contracts, and integrations.

The product requirement is now explicit: this concern is recording-only, and it should be represented as GPS ON/OFF semantics.

## Scope

### In Scope

- Remove `activity_location` from schema, types, API, mobile forms, stores, and runtime logic.
- Remove `activities.location` field usage for control flow and persistence.
- Replace behavior semantics with GPS-only terminology.
- Preserve recording behavior by mapping existing logic to GPS flags.

### Out of Scope

- Backward compatibility for old clients/payloads.
- Transitional aliases, dual write/read, and deprecation shims.

## Required Domain Model

### Canonical Runtime State

- `gpsRecordingEnabled: boolean` - Session/runtime intent to record GPS during mobile recording.
- `gpsDataPresent: boolean` - Derived runtime outcome used in recorder flow and submission shaping when needed.

These are runtime variables, not persisted database columns.

### Explicit Removals

- Remove `activity_location` enum type and all table columns using it.
- Remove `location` field from completed activities schema where used for indoor/outdoor semantics.
- Remove indoor/outdoor-based conditionals from recorder and API control flow.

### Behavioral Rules

- Recorder start/validation uses `gps_recording_enabled` and device availability only.
- Map/route rendering gates on GPS state and route presence only.
- No control-flow branch may depend on `indoor`, `outdoor`, or any location enum/text field.

## Functional Requirements

### A) Database and Types

- Drop `activity_location` enum and dependent columns.
- Drop legacy activity `location` column if present and unused.
- Do not add replacement GPS columns to relational tables for this cutover.
- Regenerate and enforce updated Supabase and Zod types.

### B) Core Contracts and Logic

- Remove activity location schemas and related types.
- Refactor recording config and helper logic to GPS-only inputs.
- Remove any logic equivalent to `outdoor => GPS required`.

### C) API Layer

- Remove `activity_location` from all router inputs/outputs and filters.
- Reject payloads containing removed location fields.
- Remove location fields from persistence and API contracts; keep GPS recording state in recorder runtime.

### D) Mobile Recording UX and Runtime

- Replace location terminology with GPS ON/OFF terminology everywhere recording behavior is controlled.
- Decouple any remaining location state from recorder service.
- Ensure submission payloads include GPS fields only for this concern.

### E) Integrations

- Remove location-based conversion requirements from integration logic.
- Use GPS fields and activity category/type for mapping decisions.
- Update route sync/import logic to avoid location enum/text dependencies.

## Migration Principles (Hard Cutover)

1. Single cutover release: schema and app logic change together.
2. No dual-write, dual-read, or legacy aliasing.
3. Fail fast for stale contracts that still send location fields.
4. Treat migration as breaking and require coordinated deployment.

## Acceptance Criteria

1. `activity_location` and activity `location` are absent from active schema/types/contracts.
2. Recorder behavior is fully GPS-driven with no indoor/outdoor checks.
3. Mobile recording UI uses GPS terminology for this behavior.
4. tRPC routes and integrations compile and run without location fields.
5. Codebase search finds zero active references to `activity_location` in production paths.

## Exit Criteria

- `plan.md` phases completed.
- `tasks.md` checklist complete.
- Typechecks/tests pass for affected packages.
- Database migrations remove location fields and enum successfully.
