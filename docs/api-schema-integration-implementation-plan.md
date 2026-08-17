# API schema integration implementation plan

## Goal

Make `packages/api` the safe translation layer between the database schema and
Core contracts. The API owns authorization, transactions, persistence mapping,
read models, DTOs, and cache effects. It does not expose raw database rows.

```text
Drizzle row -> repository mapper -> Core contract -> application service
            -> API DTO -> web/mobile client
```

## Scope

This plan integrates these database tables:

- `activity_training_effects`
- `daily_training_load`
- `athlete_recalculation_queue`
- `threshold_evidence`
- `activity_file_ingestions`
- `planned_sessions`

It preserves generic provider behavior, provider source identity, OAuth,
webhooks, and all onboarding behavior. It does not change web or mobile clients.

## Shared rules

1. Every athlete-scoped query and mutation includes `profile_id`.
2. Repositories map database rows to Core contracts and parse the result before
   returning it. Routers never return Drizzle rows.
3. Application services own transaction boundaries and map expected domain
   failures to a finite API error vocabulary.
4. `profile_athlete_state` is the only athlete-state lease and publication fence.
5. Database constraints remain the final concurrency safeguard. Core and API
   checks provide clear errors before that safeguard is reached.
6. Provider and onboarding behavior remain unchanged.
7. Worker-only fields—leases, claim tokens, staging paths, raw errors, provider
   payloads, and credentials—never appear in ordinary athlete DTOs.

### Direct-ingestion rules

- `activity_file_ingestions` is the one idempotent business record. Manual and
  mobile retry resubmits the request data to that record; it never creates an
  ingestion job or asks the server to reconstruct missing data.
- Provider retry remains in generic `provider_sync_jobs`. Provider work submits
  the intake request again and does not add a provider-specific ingestion queue.
- Direct processing verifies staging bytes, parses and derives the activity,
  promotes the accepted artifact, commits the canonical activity, and records
  the training effect in one bounded request. Staging cleanup is repeatable and
  may run after a success or failure.
- There is no `activity_ingestion_jobs`, `recovery_context`, generic ingestion
  scheduler, cancellation lifecycle, or automatic server reconstruction.
- Status and telemetry expose only finite safe outcomes. They never include raw
  request data, file or route contents, staging paths, provider payloads,
  credentials, or raw errors.

---

## Phase 1 — Repository adapters and row mappers

### 1.1 Athlete-derived state repository

**Add** `packages/api/src/infrastructure/repositories/drizzle-athlete-derived-state-repository.ts`

**Implement** the existing athlete-derived repository port with methods for:

- upserting one `activity_training_effects` record by activity and analysis revision;
- reading ordered effects from a stable rebuild cursor;
- coalescing one `athlete_recalculation_queue` row per profile;
- reading and conditionally claiming pending recalculation work;
- reading, replacing, and deleting a revisioned date range of `daily_training_load`;
- publishing a new `profile_athlete_state.published_revision` only when the
  expected revision and current lease still match;
- reading the current published daily range;
- replacing and listing `threshold_evidence` by profile/category/activity.

**Mapping rules**

- Convert database numeric values to Core finite numbers explicitly.
- Convert database timestamps to Core instants and `planning_date` to Core date
  strings without local timezone conversion.
- Rebuild `TrainingEffect` from the persisted stimulus fields, calculation
  version, fingerprint, activity analysis revision, and source revision.
- Rebuild daily coverage from persisted counts and coverage state.
- Parse every mapped result through the Core contract before returning it.

**Add tests**

`packages/api/src/infrastructure/repositories/drizzle-athlete-derived-state-repository.test.ts`

- row-to-Core mapping for effects, daily rows, queue, and threshold evidence;
- numeric/date conversion failures;
- stable rebuild cursor ordering;
- profile-scoped reads and writes;
- conditional publication rejects stale revision or lease;
- coalescing keeps earliest dirty time, highest source revision, and canonical reasons;
- daily revision replacement removes stale rows only in the rebuilt range;
- threshold evidence replacement respects the unique activity/category boundary.

### 1.2 Activity ingestion repositories

**Add** `packages/api/src/infrastructure/repositories/drizzle-activity-ingestion-repository.ts`

**Implement** existing ingestion ports for:

- loading or creating the one business record by profile and operation ID;
- binding source-specific provider identity only for provider imports;
- recording request data identity, staging expectations, and accepted
  artifact/activity links;
- direct processing of complete manual/mobile request data and safe replay of a
  prior result;
- staging cleanup status updates without exposing private staging details.

**Add tests**

- exact operation replay returns the original ingestion;
- conflicting immutable operation metadata rejects;
- non-provider ingestion rejects provider identity and provider ingestion requires it;
- only the owning profile can read or mutate an ingestion;
- retry resubmits request data against the same business record;
- direct processing cannot create a duplicate activity after an ambiguous response;
- safe DTO projection omits private paths, raw errors, provider payloads, and credentials.

### 1.3 Planned-session repository

**Add** `packages/api/src/infrastructure/repositories/drizzle-planned-session-repository.ts`

**Implement**:

- idempotent create for direct, training-plan, and recurrence sources;
- owned date-range read using planning-date bounds;
- conditional move/cancel by `profile_id` and `session_revision`;
- completion link/unlink transitions;
- optional group-event association;
- training-plan and activity-plan existence reads needed by the application layer.

**Add tests**

- source idempotency for direct, training-plan, and recurrence sessions;
- date-range ordering and bounds;
- stale `session_revision` conflict;
- profile cannot link the same group event twice;
- group-event deletion clears only the association;
- completed activity unlink preserves completion history;
- profile-scoped session and plan reads reject cross-profile references.

### 1.4 Repository exports and dependency assembly

**Update** `packages/api/src/infrastructure/repositories/index.ts`

- Export the three new Drizzle adapters.

**Update** `packages/api/src/repositories/index.ts`

- Export only the repository ports and public dependency interfaces.

**Tests**

- Ensure application services import ports, never Drizzle adapters directly.

---

## Phase 2 — Athlete-state application services

### 2.1 Effect and recalculation orchestration

**Add** `packages/api/src/application/athlete-intelligence/record-activity-training-effect.ts`

**Add** `packages/api/src/application/athlete-intelligence/request-athlete-recalculation.ts`

**Add** `packages/api/src/application/athlete-intelligence/publish-athlete-daily-load.ts`

**Add** `packages/api/src/application/athlete-intelligence/read-published-athlete-load.ts`

**Update** `packages/api/src/application/athlete-intelligence/athlete-state-worker.ts`

**Update** `packages/api/src/application/activities/submit-activity.ts`

**Behavior**

1. A new accepted activity writes its immutable training effect.
2. A current chronological activity may publish incrementally under the expected
   athlete-state revision.
3. An older activity, correction, deletion, threshold change, import, timezone
   change, algorithm change, or repair request coalesces a recalculation from
   the earliest affected point.
4. The worker locks through `profile_athlete_state`, rebuilds in stable cursor
   order, replaces the affected daily range, and publishes the next revision in
   one transaction.
5. A stale worker cannot replace daily rows or advance the published revision.

**Add tests**

- `packages/api/src/application/athlete-intelligence/record-activity-training-effect.test.ts`
- `packages/api/src/application/athlete-intelligence/request-athlete-recalculation.test.ts`
- `packages/api/src/application/athlete-intelligence/publish-athlete-daily-load.test.ts`
- Extend `athlete-state-worker.test.ts`

Test cases:

- new latest activity applies once and duplicate delivery is a no-op;
- old correction queues one rebuild at the earliest changed activity;
- several reasons coalesce without losing the highest source revision;
- lease loss and stale revision cannot publish;
- deleted activity removes its effect/evidence, queues rebuild, and does not
  retain stale daily load;
- result rows match Core incremental/rebuild fixtures;
- read returns only the published revision and never mixed rows.

### 2.2 Threshold evidence lifecycle

**Add** `packages/api/src/application/athlete-intelligence/replace-threshold-evidence.ts`

**Add** `packages/api/src/application/athlete-intelligence/read-active-threshold-evidence.ts`

**Update** `packages/api/src/application/activities/activity-mutations.ts`

**Behavior**

- Replace evidence atomically for one profile/category/activity.
- Mark evidence superseded or deleted instead of silently dropping history.
- Activity deletion removes or invalidates its evidence in the same transaction,
  then requests recalculation.
- Read paths project active evidence only for threshold selection.

**Add tests**

- replacement is idempotent for the same activity analysis revision;
- duplicate profile/category/activity evidence conflicts clearly;
- deleted evidence cannot affect a rebuilt threshold;
- activity deletion preserves planned-session history while invalidating threshold evidence;
- cross-profile evidence mutation is forbidden.

---

## Phase 3 — Ingestion application services

### 3.1 Direct operation processing

**Update** `packages/api/src/application/activity-file-ingestion/process-manual-activity-file.ts`

**Update** `packages/api/src/application/activity-file-ingestion/mobile-recording-upload.ts`

**Update** `packages/api/src/application/activity-file-ingestion/submit-imported-activity-artifact.ts`

**Update** `packages/api/src/application/activity-file-ingestion/finalize-activity-artifact-ingestion.ts`

**Behavior**

- Existing `activity_file_ingestions` is the operation record for mobile, manual,
  and provider acquisition.
- Manual/mobile retry resubmits request data to the same direct-processing
  service. There is no ingestion job, recovery context, generic scheduler,
  cancellation lifecycle, or automatic server reconstruction.
- Provider retry remains owned by generic `provider_sync_jobs`; it resubmits the
  provider acquisition request rather than creating an ingestion job.
- Provider source fields are validated only for provider imports.
- Verification, parsing, derivation, artifact promotion, canonical activity
  persistence, and training-effect write are transactionally consistent where
  applicable. Staging cleanup is repeatable and privacy-safe.

**Add tests**

- replayed begin/commit requests converge on one ingestion;
- retry after an ambiguous response resubmits request data without a duplicate activity;
- parser/hash/promotion failure returns a bounded failure and does not reconstruct
  missing request data;
- staged cleanup repeats safely and does not expose private paths or payloads;
- manual/mobile/provider sources produce one canonical activity result;
- safe status projection contains no private worker data.

---

## Phase 4 — Planned-session application services

### 4.1 Session mutations

**Add** `packages/api/src/application/calendar/create-planned-session.ts`

**Add** `packages/api/src/application/calendar/move-planned-session.ts`

**Add** `packages/api/src/application/calendar/cancel-planned-session.ts`

**Add** `packages/api/src/application/calendar/link-planned-session-completion.ts`

**Add** `packages/api/src/application/calendar/unlink-deleted-activity-completion.ts`

**Add** `packages/api/src/application/calendar/read-planned-session-range.ts`

**Update** `packages/api/src/application/training-plan/applyTemplateUseCase.ts`

**Update** `packages/api/src/application/activities/activity-mutations.ts`

**Behavior**

- Apply a training plan by creating profile-owned planned sessions.
- Preserve the original target date and immutable prescription snapshot after a
  session moves.
- Require `expectedRevision` for move, cancel, link, and unlink.
- Completion link requires owned non-cancelled session and owned activity.
- Activity deletion performs the explicit unlink transition before deletion.
- Group event association is optional and does not convert the group event into
  a personal session.

**Add tests**

- direct/training-plan/recurrence session idempotency;
- stale move/cancel/link conflicts;
- own plan or system template allowed; another athlete's plan denied;
- one profile/group-event association allowed once;
- group-event deletion preserves the personal session and clears its link;
- activity deletion gives `activity_deleted` completion history rather than
  deleting or cancelling the planned session;
- recurrence occurrence date remains the original target date.

---

## Phase 5 — API DTOs and routers

### 5.1 DTO contracts

**Add** `packages/api/src/contracts/athlete-load-range.ts`

**Add** `packages/api/src/contracts/training-effects.ts`

**Update** `packages/api/src/contracts/planned-sessions.ts`

**Add** `packages/api/src/contracts/threshold-evidence.ts`

**DTO rules**

- Athlete-load range includes profile ID, published revision, ordered daily rows,
  coverage, and freshness—not internal leases or queue details.
- Training-effect reads include user-meaningful effect/provenance fields only.
- Ingestion status includes safe state, IDs, and finite failure code; never
  staging path, credentials, provider payload, or raw error. It does not expose a
  job, cancellation, recovery, or scheduler state.
- Planned session includes source, prescription snapshot, schedule state,
  completion state, and optional group-event ID.
- Threshold evidence exposes only fields required for athlete explanation; internal
  persistence/worker data stays private.

**Tests**

- DTO parse tests reject raw database rows with internal fields.
- SuperJSON round-trip tests preserve dates and numeric values.
- DTO fixture tests cover every lifecycle union variant.

### 5.2 Routers

**Add or update** `packages/api/src/routers/athlete-intelligence.ts`

**Update** `packages/api/src/routers/activity-files.ts`

**Update** `packages/api/src/routers/activities.ts`

**Update** `packages/api/src/routers/events.ts`

**Update** `packages/api/src/routers/planning/training-plans/base.ts`

**Update** `packages/api/src/routers/index.ts`

**Procedures**

- protected athlete load-range and current-state reads;
- protected threshold-evidence explanation read where needed;
- protected ingestion status and retry actions; retry requires resubmitted
  request data and targets the existing business record;
- protected planned-session create, range read, move, cancel, link, and unlink;
- an explicitly authorized recalculation repair request, if product policy allows it.

There are no ingestion worker claim, lease, cancellation, or scheduler
operations. Provider retry controls remain service-only under generic provider
sync behavior and are not ordinary athlete procedures.

**Router tests**

- unauthenticated and cross-profile calls fail;
- valid DTO response shape and finite error mapping;
- stale revision maps to conflict;
- mutation receipt/cache tags cover athlete state, activities, calendar/planned
  sessions, plan, home, and ingestion status;
- worker-only fields never appear in a response.

---

## Phase 6 — Cutover and removal

### Cutover sequence

1. Land repository adapters and their live-database tests.
2. Land application services and transaction/race tests.
3. Land DTOs and thin routers.
4. Run old/new read parity for athlete state, planning, ingestion, and completion
   lifecycle behavior.
5. Move web and mobile consumers in a later application-surface change.
6. Remove old direct router SQL and obsolete service paths only after callers
   have moved and no old reads/writes remain.

### Retain

- generic provider registry, adapters, callbacks, queues, and source identity;
- provider imports through the ingestion operation model;
- onboarding states, transitions, retries, and recovery;
- generic `events` for non-planned events and group events;
- existing table names and existing authorization boundaries.

### Verification gates

- API typecheck and unit tests after each phase;
- live-database tests for ownership, transactions, revision fences, source
  uniqueness, idempotent direct processing, staging cleanup, activity deletion,
  and planned-session lifecycle;
- changed-scope architecture check;
- API contract/DTO tests;
- full `pnpm quality:agent` before integration to clients.

### Delivery boundaries

This plan authorizes no deploy, push, PR, provider configuration, real/shared
database reset, data deletion, or client-surface change.
