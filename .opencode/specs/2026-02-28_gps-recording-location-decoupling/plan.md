# Technical Implementation Plan - Hard Cutover to GPS-Only Semantics

Date: 2026-02-28
Status: Ready for implementation
Owner: Mobile + Core + tRPC + Supabase + Integrations + QA
Inputs: `design.md`

## 1) Architecture Decisions to Lock

1. GPS on/off state in mobile recorder runtime is the only recording control input.
2. GPS data presence is derived in runtime flow; not stored as new relational columns for this cutover.
3. `activity_location` and activity `location` are removed from schema and contracts.
4. No backward compatibility, aliases, or dual fields.
5. Cutover is coordinated as one breaking release.

## 2) Workstreams

### A) Supabase Breaking Migration

- Remove location semantics columns:
  - drop `activity_plans.activity_location`
  - drop `activities.location` (if present)
- Drop `public.activity_location` enum type.
- Regenerate Supabase types and supazod schemas after migration.

### B) Core Package Breaking Contract Update

- Remove location-related schema fields and enums.
- Update recording config resolver and helpers to GPS-only logic.
- Remove location-based estimation/control-flow branches.
- Update all exports and types to eliminate location references.

### C) tRPC Breaking API Update

- Remove `activity_location` and `location` from all router inputs/outputs.
- Update plan/event/activity routers and filters to remove location semantics; do not persist replacement GPS columns.
- Reject stale payloads still sending removed location fields.
- Remove hardcoded location defaults in FIT/import paths.

### D) Mobile Runtime and UX Update

- `ActivityRecorderService`: remove location-driven toggles and checks.
- Hooks/selectors: expose GPS-only state for recording behavior.
- UI copy/labels: replace indoor/outdoor control language with GPS ON/OFF.
- Forms/stores/payloads: remove `activityLocation`; use GPS runtime state in recorder flow only.

### E) Integration Update (Wahoo + importers)

- Remove location enum/text dependencies in mapping utilities.
- Use category/type + recorder GPS state for conversion and route eligibility logic.
- Ensure imports write GPS canonical fields and no location fields.

## 3) Cutover Strategy (No Compatibility Layer)

- Deploy migration and app changes together.
- Require all clients/services to use new contracts immediately.
- Treat stale contracts as errors and fail fast.

## 4) Validation and Quality Gates

- `pnpm --filter core check-types`
- `pnpm --filter trpc check-types`
- `pnpm --filter mobile check-types`
- `pnpm --filter core test`
- `pnpm --filter trpc test`
- `pnpm --filter mobile test`

## 5) Test Strategy

- Migration tests verifying removal of location columns/enum and presence of GPS columns.
- Core unit tests verifying GPS-only resolver behavior.
- tRPC contract tests ensuring removed fields are rejected.
- Mobile tests for GPS toggle behavior, map gating, and payload shape.
- Integration tests for Wahoo/import paths without location fields.

## 6) Risk Management

- Risk: deploy ordering causes runtime failures.
  - Mitigation: single coordinated release window with rollback plan.
- Risk: hidden references to removed fields remain.
  - Mitigation: repo-wide search gate for `activity_location` and `activities.location` before release.
- Risk: stale clients send old payloads.
  - Mitigation: version gate and explicit failure responses.

## 7) Completion Definition

- All workstreams complete.
- Production contracts and runtime paths are GPS-only for recording behavior.
- `activity_location` enum and all related location references are removed from active code and database.
