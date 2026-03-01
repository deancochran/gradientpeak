# Tasks - GPS Recording and Location Decoupling

Last Updated: 2026-02-28
Status: Active
Owner: Mobile + Core + tRPC + Supabase + Integrations + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [x] Lock hard cutover policy (no backward compatibility).
- [x] Lock canonical runtime GPS state names (`gpsRecordingEnabled`, `gpsDataPresent`).
- [x] Lock removal scope for all `activity_location` and activity `location` usage.

## 1) Pre-Migration Audit Gate

- [x] Build complete reference inventory for `activity_location` and `location` control-flow usage.
- [x] Identify all router contracts that accept/emit location semantics.
- [x] Identify integration conversion paths relying on category + location coupling.

## 2) Supabase Breaking Migration

- [x] Confirm no replacement GPS columns are added to `activity_plans` or `activities`.
- [x] Drop `activity_plans.activity_location`.
- [x] Drop `activities.location`.
- [x] Drop `public.activity_location` enum type.
- [x] Regenerate `database.types.ts` and supazod schemas.

## 3) Core Contract Migration

- [x] Remove location enums and location fields from core schemas.
- [x] Update recording/plan/activity schemas to remove location fields and use runtime GPS state only where needed.
- [x] Refactor recording config resolver away from `outdoor => GPS required`.
- [x] Remove location references from estimation/context types where applicable.
- [x] Add/adjust unit tests for canonical behavior.

## 4) tRPC Migration

- [x] Update `activity_plans` router input/output contracts.
- [x] Update `events` filters for GPS semantics.
- [x] Update `activities` write/read paths to remove location semantics without adding persisted GPS columns.
- [x] Remove hardcoded location defaults in FIT ingest path.
- [x] Remove all location fields from router contracts and validation.
- [x] Add/adjust router tests for GPS-only contracts and rejection of removed fields.

## 5) Mobile Runtime + UX Migration

- [x] Remove location state dependencies from recorder service behavior.
- [x] Update recorder hooks/selectors to canonical GPS semantics.
- [x] Update recording UI terminology to GPS ON/OFF where behavior is controlled.
- [x] Remove `activityLocation` from form/store contracts.
- [x] Update submission payloads and recorder actions to rely on GPS runtime state only.
- [x] Add/adjust tests for GPS toggle behavior and map gating logic.

## 6) Integration Migration

- [x] Update Wahoo/import mapping utilities to remove location dependencies.
- [x] Validate route sync eligibility logic against GPS/route semantics.
- [x] Validate webhook importer no longer writes legacy location fields.
- [x] Add/adjust integration tests for GPS-only mapping paths.

## 7) Hard-Cut Validation and Cleanup

- [x] Confirm zero production references to `activity_location`.
- [x] Confirm zero production references to activity `location` for indoor/outdoor semantics.
- [x] Remove any remaining transitional code or docs referencing legacy location model.
- [x] Update docs with GPS-only terminology.

## 8) Quality Gates

- [x] `pnpm --filter core check-types`
- [x] `pnpm --filter trpc check-types`
- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter core test`
- [x] `pnpm --filter trpc test`
- [x] `pnpm --filter mobile test`

## 9) Completion Criteria

- [x] All sections 0-8 complete.
- [x] Canonical GPS-only model active in recorder, API, and persistence.
- [x] No production references to `activity_location` or indoor/outdoor location control logic.
- [x] Legacy enum and fields removed from schema and active code.
