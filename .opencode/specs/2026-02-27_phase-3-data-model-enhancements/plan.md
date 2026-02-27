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
  - complete cutover from `planned_activities` routes/contracts to `events` routes/contracts
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

- Add canonical `events` storage to supersede `planned_activities` for all schedule use cases.
- Add or refactor event entities to support typed events + optional links.
- Add recurrence fields and instance/series linkage model.
- Add imported-source identity fields for idempotent upsert behavior.
- Add recurrence split support for `this-and-future` through deterministic series split contracts.
- Remove `planned_activities` schema and API dependencies; planned activities become `events` with `event_type='planned_activity'`.

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
- Keep unread model checkpoint-based (`last_read_seq`) and defer per-message receipts.

## 3.1) Implementation Sketches (for `init.sql` and key files)

The snippets below are implementation-oriented examples to reduce ambiguity before migration authoring.
They are not final SQL/TypeScript and must be aligned with existing naming conventions and RLS posture.

### A) `packages/supabase/schemas/init.sql` (illustrative additions)

```sql
-- Recurrence master rows
create table if not exists event_series (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  rrule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

-- Per-occurrence overrides/cancellations
create table if not exists event_exceptions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references event_series(id) on delete cascade,
  occurrence_key text not null,
  status text not null default 'active',
  override_title text,
  override_starts_at timestamptz,
  override_ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (series_id, occurrence_key)
);

-- Imported source identity for idempotent upserts
create table if not exists external_event_links (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references event_series(id) on delete cascade,
  provider text not null,
  integration_account_id uuid not null,
  external_calendar_id text not null,
  external_event_id text not null,
  occurrence_key text not null,
  updated_at timestamptz not null default now(),
  unique (
    provider,
    integration_account_id,
    external_calendar_id,
    external_event_id,
    occurrence_key
  )
);

-- Relationship-scoped coaching grants
create table if not exists coaching_relationships (
  id uuid primary key default gen_random_uuid(),
  coach_profile_id uuid not null references profiles(id) on delete cascade,
  athlete_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  check (coach_profile_id <> athlete_profile_id)
);

create table if not exists coaching_permission_grants (
  relationship_id uuid not null references coaching_relationships(id) on delete cascade,
  permission text not null,
  granted boolean not null default true,
  primary key (relationship_id, permission)
);

-- Messaging unread checkpoint model
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  last_read_seq bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id),
  check (last_read_seq >= 0)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_profile_id uuid not null references profiles(id) on delete cascade,
  seq bigint not null,
  body text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create index if not exists idx_messages_conversation_seq
  on messages (conversation_id, seq);
```

### B) `packages/trpc/src/routers/events.ts` (events-first query sketch)

```ts
const event = await ctx.supabase
  .from("events")
  .select(
    "id,title,starts_at,ends_at,event_type,activity_plan_id,training_plan_id",
  )
  .eq("id", input.eventId)
  .eq("event_type", "planned_activity")
  .single();

return event.data;
```

### C) New router surface (`packages/trpc/src/routers/events.ts`) sketch

```ts
createOrUpdateException: protectedProcedure
  .input(
    z.object({
      seriesId: z.string().uuid(),
      occurrenceKey: z.string().min(1),
      scope: z.enum(["single", "future", "all"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (input.scope === "future") {
      return splitSeriesAtBoundary(ctx, input.seriesId, input.occurrenceKey);
    }
    return upsertException(ctx, input);
  });
```

### D) Core contract sketch (`packages/core/contracts/phase-3.ts`)

```ts
export const RecurrenceEditScopeSchema = z.enum(["single", "future", "all"]);

export const ExternalIdentitySchema = z.object({
  provider: z.string().min(1),
  integrationAccountId: z.string().uuid(),
  externalCalendarId: z.string().min(1),
  externalEventId: z.string().min(1),
  occurrenceKey: z.string().min(1),
});
```

### E) Notifications dedupe sketch (`packages/trpc/src/routers/notifications.ts`)

```ts
await ctx.supabase.from("notifications").upsert(
  {
    profile_id: input.profileId,
    type: input.type,
    target_type: input.targetType,
    target_id: input.targetId,
    dedupe_version_or_window: input.dedupeWindow,
    title: input.title,
    message: input.message,
  },
  {
    onConflict:
      "profile_id,type,target_type,target_id,dedupe_version_or_window",
  },
);
```

### F) File impact map (implementation context)

- Schema: `packages/supabase/schemas/init.sql`, `packages/supabase/migrations/*`
- Generated types: `packages/supabase/database.types.ts`, `packages/supabase/supazod/schemas.ts`, `packages/supabase/supazod/schemas.types.ts`
- Routers: remove `packages/trpc/src/routers/planned_activities.ts`, update `packages/trpc/src/routers/activity_plans.ts`, add `packages/trpc/src/routers/events.ts`, add `packages/trpc/src/routers/coaching.ts`, add `packages/trpc/src/routers/messages.ts`, add `packages/trpc/src/routers/notifications.ts`
- Core contracts: `packages/core/contracts/*`, `packages/core/schemas/*`
- Mobile adapters likely touched: `apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`, `apps/mobile/components/ScheduleActivityModal.tsx`

## 3.2) `planned_activities` -> `events` redesign blueprint

This blueprint is mandatory for this phase and enforces a full cutover (no long-lived compatibility layer).

### A) Why this redesign

- Current repository coupling is broad (`planned_activities` appears in schema, routers, mobile flows, Wahoo sync, and tests).
- Direct rename/drop would create high regression risk and break integrations.
- Hard cutover keeps one canonical model and avoids long-term maintenance of duplicate contracts.

### B) Canonical model decision

- `events` is source of truth for planned scheduling.
- Use `event_type='planned_activity'` to preserve semantics.
- `planned_activities` is removed from target schema and active code paths in this phase.

### C) Required migration phases

1. **Expand**: create `events` (+ recurrence and identity tables) and add required indexes/constraints.
2. **Backfill**: idempotently migrate `planned_activities` rows to `events` with deterministic mapping.
3. **Cutover**: switch routers/services/clients/integrations to `events` APIs and contracts.
4. **Remove**: delete `planned_activities` references from schema, generated types, routers, tests, and clients.
5. **Verify**: run migration replay, compile checks, and integration tests on events-only paths.

### D) Hotspot files requiring explicit migration review

- Schema/types: `packages/supabase/schemas/init.sql`, `packages/supabase/database.types.ts`, `packages/supabase/supazod/schemas.ts`
- Router hotspots: `packages/trpc/src/routers/planned_activities.ts`, `packages/trpc/src/routers/training-plans.base.ts`, `packages/trpc/src/routers/home.ts`, `packages/trpc/src/routers/activity_plans.ts`, `packages/trpc/src/routers/activities.ts`, `packages/trpc/src/routers/integrations.ts`
- Integration hotspots: `packages/trpc/src/lib/integrations/wahoo/sync-service.ts`, `packages/trpc/src/lib/integrations/wahoo/activity-importer.ts`
- Mobile hotspots: `apps/mobile/app/(internal)/(tabs)/plan.tsx`, `apps/mobile/components/ScheduleActivityModal.tsx`, `apps/mobile/lib/services/ActivityRecorder/index.ts`, `apps/mobile/lib/hooks/useActivitySubmission.ts`

### E) Cutover and rollback conditions

- Row parity checks by profile/date/status between pre-cutover source snapshot and canonical events.
- Recurrence parity checks for split/override behavior.
- Sync validation checks for Wahoo mapping resolution.
- Roll back the migration release if post-cutover verification fails; no dual-read fallback path is maintained.

## 4) Migration Strategy

- Additive-first migration to build events model, followed by hard cutover to events-only reads/writes.
- Remove old read paths in same phase once events cutover verification passes.
- Include backfill scripts where derived linkage data is required.
- Backfill invariants must be defined before execution (row parity, ownership parity, recurrence parity, no orphan rows).
- Rollback criteria: any invariant failure above threshold, unresolved drift, or query latency regression beyond agreed SLO.
- Migration replay on a clean database plus schema/data drift checks is a required gate before rollout approval.
- Cleanup is mandatory in-phase: remove compatibility code and deprecated references before completion sign-off.

## 5) Integrity Constraints and Index Baseline

Must-have baseline constraints/indexes (names illustrative; exact SQL decided during implementation):

- Recurrence integrity:
  - unique `(series_id, occurrence_key)` for exception rows
  - FK `event.series_id -> event_series.id` with delete behavior aligned to lifecycle policy
  - check constraint for valid scope enum (`single`, `future`, `all`) where stored
  - index `(user_id, start_at)` for calendar range queries
- Import idempotency:
  - unique `(provider, integration_account_id, external_calendar_id, external_event_id, occurrence_key)`
  - check `provider <> ''` and non-null external identifiers
  - index `(integration_account_id, external_calendar_id, updated_at)` for sync scans
- Coaching relationships/permissions:
  - unique active relationship `(coach_id, athlete_id)` with lifecycle-aware partial uniqueness
  - FK permissions table references relationship row (not user-global table)
  - check preventing self-relationship (`coach_id <> athlete_id`)
  - index `(athlete_id, status)` for roster filtering
- Unread + notifications:
  - unique participant `(conversation_id, user_id)`
  - check `last_read_seq >= 0`
  - message index `(conversation_id, seq)` for unread delta computation
  - notification dedupe unique `(user_id, type, target_type, target_id, dedupe_version_or_window)`
  - notification index `(user_id, read_at, created_at)` for inbox queries

## 6) Required DB Workflow (Order Mandatory)

For each schema update in this phase:

1. Update `packages/supabase/schemas/init.sql` first.
2. Run `supabase db diff` to generate migration.
3. Run `supabase migration up` to apply locally.
4. Run `pnpm --filter @repo/supabase run update-types`.
5. Verify generated artifacts are updated and compile cleanly.

```bash
# Required execution sequence
supabase db diff
supabase migration up
pnpm --filter @repo/supabase run update-types
```

## 7) API Cutover Plan

- Introduce new procedure inputs/outputs behind explicit versioned fields when needed.
- Remove `plannedActivities` router surface and migrate consumers to `events` procedures.
- Rename or replace query-client keys/selectors so all planned scheduling data resolves through `events`.
- Add focused mapping tests to prevent event-shape regressions.

## 8) Validation and QA Strategy

### Schema Tests

- Constraint validation (foreign keys, uniqueness, check constraints).
- Idempotency checks for imported event sync keys.
- Permission-bound access tests for coach/athlete operations.
- Migration replay + drift detection tests against clean and seeded databases.

### Router/Integration Tests

- Event create/edit/delete with recurrence scope behaviors.
- Template apply creates isolated graph copies.
- Multi-goal/multi-target retrieval and readiness persistence.
- Conversation unread/read-state updates and soft-delete visibility.
- Notification routing metadata integrity.

## 9) Implementation Phases

### Phase 1 - Contracts and schema skeleton

- lock model contracts
- add base tables/columns/indexes with additive strategy

### Phase 2 - tRPC and client cutover

- implement write/read paths for new model
- migrate existing consumers to events-only contracts
- remove `plannedActivities` API usage and client query keys

### Phase 3 - Backfill and integrity hardening

- run backfills
- validate backfill invariants and rollback criteria
- enforce stricter constraints where safe

### Phase 4 - Verification and cleanup

- full type/test/lint gates
- run migration replay + drift checks as release gate
- confirm no active references to `planned_activities` remain

## 10) Quality Gates

```bash
pnpm --filter @repo/supabase run update-types
pnpm --filter @repo/trpc test
pnpm --filter @repo/trpc check-types
pnpm check-types
pnpm lint
```

## 11) Definition of Done

1. All Phase 3 model concepts are representable in schema and accessible through tRPC.
2. Existing consumers remain stable or are explicitly migrated.
3. Migration workflow is reproducible on a clean local database.
4. Migration replay and drift checks pass with documented evidence.
5. No active references to `planned_activities` remain in schema, generated types, routers, integrations, or clients.
6. All tasks in `tasks.md` are complete.
