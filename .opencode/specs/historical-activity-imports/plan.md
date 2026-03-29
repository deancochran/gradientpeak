# Plan

## Phase 1 - Narrow Import Surface

Goal: define the smallest viable historical activity import path.

1. Keep scope limited to completed historical activity files.
2. Choose the first-pass upload entry point in mobile.
3. Decide whether to extend the current FIT router or add a small dedicated historical import router.
4. Define the normalized parse-and-store contract for `FIT` first, with `TCX`/`GPX` deferred.

Exit criteria:

- import scope is limited and explicit
- upload and parse ownership is clear
- supported file types are documented

## Phase 2 - Parse And Store

Goal: let a user upload one supported historical activity file and persist it as a canonical activity.

1. Add mobile file-picking and submission UI.
2. Upload the file safely.
3. Parse the file into a normalized activity shape.
4. Persist the historical activity into `activities` with minimal provenance.

Exit criteria:

- mobile can submit a supported historical activity file
- backend can parse and store it as a canonical activity
- success and failure states are clear

## Phase 3 - Downstream State Policy

Goal: explicitly define and implement how imported activities affect related state.

1. Define when imported files should create `activity_efforts`.
2. Define when imported files should append inferred `profile_metrics`.
3. Define the as-of timestamp rule for all derived calculations.
4. Move stale-prone threshold-dependent calculations toward dynamic read-time behavior instead of persisted activity fields.
5. Confirm how existing activity-driven views should refresh after import.
6. Keep the policy conservative where source fidelity is weak.
7. Remove stale-prone derived activity columns through a Supabase migration and regenerate DB types.

Exit criteria:

- downstream effects are explicit, not accidental
- low-fidelity imports do not create misleading derived state
- derived calculations use only prior state at the activity timestamp
- out-of-order imports stay correct without requiring full later-activity rewrites
- existing home/trend reads reflect imported history correctly
- database schema matches the simplified dynamic architecture

## Phase 4 - Documentation And References

Goal: keep reference docs aligned with the narrower feature.

1. Update internal interaction inventory once the real import surface exists.
2. Update project reference material only if the import path becomes a stable architectural pattern.
3. Leave broader provider/archive docs for later phases if the scope expands.

Exit criteria:

- internal references match the implemented narrow import flow
- broader future ideas remain out of active scope

## Recommended Execution Order

1. Phase 1 narrow contract
2. Phase 2 parse-and-store implementation
3. Phase 3 downstream state policy and tests
4. Phase 4 docs
