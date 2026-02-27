# Technical Implementation Plan - Phase 3 Data Model Enhancements

Date: 2026-02-27
Status: Ready for implementation
Owner: Backend + Core + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `packages/supabase`:
  - canonical schema definitions and migrations
  - relational integrity constraints and indexes
  - generated database and Zod types
- `packages/trpc`:
  - read/write procedures aligned to new model
  - permission enforcement at procedure boundaries
  - mapping adapters for backward-compatible responses during transition
- `packages/core`:
  - shared enums/contracts where needed for model-level concepts
  - no database-specific logic

## 2) Contract Lock Before Migration

Lock these decisions before any migration is authored:

1. Event type taxonomy and required fields per event kind.
2. Recurrence representation and edit-scope semantics.
3. Template visibility/public discoverability contracts.
4. Goal/target metric identity model (including unit strategy).
5. Coaching permission enum and lifecycle state machine.
6. Notification type routing contract.

## 3) Schema Workstreams

### A) Unified Calendar Events

- Add or refactor event entities to support typed events + optional links.
- Add recurrence fields and instance/series linkage model.
- Add imported-source identity fields for idempotent upsert behavior.

### B) Training Hierarchy and Reuse

- Ensure plan/phase/collection/workout relationships are explicit.
- Add ordering and relative offset fields where needed.
- Support many-to-many reuse where conceptually required.

### C) Template Layer

- Add template designation fields + visibility state.
- Add social metadata relations (likes/saves).
- Add safe apply/copy lineage metadata for traceability.

### D) Goals and Targets

- Add goal-to-target one-to-many support.
- Add target checkpoint/date and readiness persistence fields.
- Add indexes for fast retrieval by active plan and date.

### E) Coaching, Messaging, Notifications

- Coaching relationships with lifecycle timestamps.
- Permission relation model with independent grants.
- Conversation participants, message records, read checkpoints.
- Notification records with typed route target references.

## 4) Migration Strategy

- Prefer additive changes first, then compatibility adapters, then optional cleanup migration.
- Preserve old read paths while new write paths stabilize.
- Include backfill scripts where derived linkage data is required.

## 5) Required DB Workflow (Order Mandatory)

For each schema update in this phase:

1. Update `packages/supabase/schemas/init.sql` first.
2. Run `supabase db diff` to generate migration.
3. Run `supabase migration up` to apply locally.
4. Run `pnpm --filter @repo/supabase run update-types`.
5. Verify generated artifacts are updated and compile cleanly.

## 6) API and Compatibility Plan

- Introduce new procedure inputs/outputs behind explicit versioned fields when needed.
- Keep old response shape compatibility where existing mobile/web screens still depend on it.
- Add focused mapping tests to prevent shape regressions.

## 7) Validation and QA Strategy

### Schema Tests

- Constraint validation (foreign keys, uniqueness, check constraints).
- Idempotency checks for imported event sync keys.
- Permission-bound access tests for coach/athlete operations.

### Router/Integration Tests

- Event create/edit/delete with recurrence scope behaviors.
- Template apply creates isolated graph copies.
- Multi-goal/multi-target retrieval and readiness persistence.
- Conversation unread/read-state updates and soft-delete visibility.
- Notification routing metadata integrity.

## 8) Implementation Phases

### Phase 1 - Contracts and schema skeleton

- lock model contracts
- add base tables/columns/indexes with additive strategy

### Phase 2 - tRPC wiring and compatibility adapters

- implement write/read paths for new model
- preserve existing consumers via adapters where needed

### Phase 3 - Backfill and integrity hardening

- run backfills
- enforce stricter constraints where safe

### Phase 4 - Verification and cleanup

- full type/test/lint gates
- remove temporary compatibility code that is no longer needed

## 9) Quality Gates

```bash
pnpm --filter @repo/supabase run update-types
pnpm --filter @repo/trpc test
pnpm --filter @repo/trpc check-types
pnpm check-types
pnpm lint
```

## 10) Definition of Done

1. All Phase 3 model concepts are representable in schema and accessible through tRPC.
2. Existing consumers remain stable or are explicitly migrated.
3. Migration workflow is reproducible on a clean local database.
4. All tasks in `tasks.md` are complete.
