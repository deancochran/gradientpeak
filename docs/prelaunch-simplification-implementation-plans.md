# Pre-launch simplification implementation plans

## Purpose and status

This is the code-level plan set for reducing GradientPeak before its first
deployment. It turns the accepted product direction in
[`simplification-program.md`](./simplification-program.md) into independently
reviewable implementation plans.

The objective is a smaller, faster, observable product that preserves the
athlete's core journey:

1. create a secure account and finish setup;
2. record, upload, or sync completed activities;
3. see trustworthy performance, load, and trends;
4. create plans, schedule sessions, and track goals; and
5. optionally connect Wahoo.

These are **hard-cut plans**. Do not add compatibility DTOs, fallback readers,
dual writes, schema shims, or transition-only UI. A fresh database or an app
local-data reset requires explicit operational approval and is not authorized
by this document.

## Planning decisions

| Decision | Direction |
| --- | --- |
| Source of current athlete truth | A revisioned athlete snapshot is the only normal read authority. |
| Future schedule | Calendar scheduled sessions are the only editable future schedule. |
| Activity intake | Mobile recordings, manual files, and Wahoo imports converge on one server-owned intake operation. |
| Provider scope | Preserve the abstract provider layer and its generic runtime contracts. Improve provider reliability, security, and observability without narrowing the architecture to Wahoo. |
| Onboarding scope | Preserve the current onboarding lifecycle and its durable states. Improve its reliability and observability without reducing its states or flow. |
| Existing table names | Keep every existing table name. Extend or retire its fields only when needed; do not rename a table as part of this simplification. |
| Data compatibility | None is required before launch; calculate fresh derived data after the approved reset. |
| Observability | One privacy-safe operational event contract. No raw payloads, identifiers, credentials, health data, routes, or free-form errors. |
| Social and groups | Retain only what is already accepted in `simplification-program.md`. Defer any additional social/coaching reduction until its launch-scope decision is explicit. |

## Dependency order

```text
0. Correctness gates and final target data-model decisions
1. Auth and telemetry foundation
2. Core athlete-derived-state, athlete read model, and activity-plan/content contracts
3. Fresh database baseline supporting the settled model
4. Unified activity intake
5. Mobile recorder on the intake contract
6. Planning and calendar read/write cut
7. Provider reliability and onboarding hardening
8. API contract, authorization, and cache cleanup
```

Plans 2–8 must begin from a reconciled implementation base. The current `dev`
checkout contains substantial overlapping uncommitted work; do not layer a
hard-cut implementation on top of an unknown mixed state.

---

## Plan 0 — Correctness gates before structural deletion

### Outcome

Known correctness ambiguities are resolved before any old contract, table, or
reader is removed.

### Required changes and proof

1. Make `publishedRevision` the only training-plan preview/save fence and remove
   the duplicate performance-revision fields after callers move.
2. Make a later successful import supersede a covered failed import run so an
   athlete can become fresh again.
3. Remove persisted `performance_model` JSON/revision as a current-state authority.
4. Persist each materialized personal recurrence `occurrenceKey` as its scheduled
   planning date; never slice a UTC instant into a schedule date.
5. Prove `private`, `followers`, and `public` visibility round trips unchanged
   through app state, DTOs, and persistence.
6. Define finite daily Common Load aggregation bounds that allow multiple valid
   sessions on one date.
7. Capture accepted fixtures for targets, load, readiness, plan application,
   recurrence, and visibility. A failing gate blocks structural deletion.

---

## Plan 1 — Secure authentication and observability foundation

### Outcome

Users can sign up, sign in, verify email, recover access, and revoke sessions
through one secure session model. Failures are measurable without collecting
sensitive data.

### Key decisions

- Web uses a server-backed, `HttpOnly` cookie session.
- Mobile uses exactly one Better Auth secure-storage session transport. Remove
  alternate bearer-token handling and never allow a release build to change its
  API origin.
- Production configuration is explicit and fail-closed: exact app origin,
  trusted origins, mobile callback destination, and authentication secret.
- Password-reset links use verified iOS Universal Links and Android App Links,
  not a capturable custom scheme.
- Operational telemetry uses a shared allowlist contract. Product analytics
  remains disabled until a separate consent decision exists.

### Implementation steps

1. Add `packages/telemetry/` with strict Zod contracts, sanitizer, event names,
   finite failure categories, and tests.
2. Make `packages/auth/src/runtime/env.ts` and `server.ts` validate production
   origins, secret, mobile callback settings, rate limits, and credential policy.
3. Simplify `apps/web/src/routes/api/auth/$.ts` to a thin Better Auth handler.
   Remove address-lookup behavior and response shaping that reveals whether an
   account exists.
4. Update `apps/web/src/routes/auth/confirm.ts`, mobile callback handling, and
   reset/change-password UI to show only finite public error codes.
5. Adopt the shared sanitizer in API telemetry, web Sentry setup, and mobile
   Sentry setup. Remove direct user identity attachment and raw exception/error
   forwarding.
6. Remove PostHog startup/autocapture configuration and unused dependencies
   unless a consented analytics plan is accepted later.

### Primary paths

- `packages/auth/src/runtime/{env,server,verification}.ts`
- `packages/auth/src/contracts/**`
- `packages/telemetry/**` (new)
- `packages/api/src/{telemetry,trpc}.ts`
- `apps/web/src/routes/api/auth/$.ts`, `apps/web/src/routes/auth/**`
- `apps/web/src/{instrument.client.ts,lib/auth/mobile-callback.ts}`
- `apps/mobile/app/(external)/**`, `apps/mobile/lib/{auth,services}/**`

### Operational events

- `auth.operation`
- `auth.email_handoff`
- `runtime.startup`
- `runtime.exception`

Allowed dimensions are surface, operation, outcome, transport, bounded duration,
and a finite failure class. Never send email, session IDs, tokens, URLs, IPs,
user agents, callback values, or raw errors.

### Proof

- Hostile and replayed callbacks fail closed.
- Registered and unregistered email requests are indistinguishable.
- Reset and password-change flows revoke all applicable sessions.
- Browser cross-site mutations fail origin/CSRF checks.
- Sanitizer canary tests prove credentials, URLs, personal data, and raw errors
  do not leave the process.

---

## Plan 2 — Fresh database baseline for the accepted launch model

### Outcome

The database represents only active product primitives with strong ownership,
queue, and source-identity rules. It is faster to query and easier to inspect.

### Key decisions

- Rewrite the single active fresh baseline rather than create upgrade migrations.
- Retain the accepted primitives: profiles, athlete snapshot, activities and
  artifacts, plans, calendar sessions, goals, Wahoo, and accepted visibility/
  group behavior.
- Keep relational enforcement for ownership, source identity, queue leases,
  revision publication, and storage boundaries.
- Move only reusable domain validation into Core; do not duplicate it in clients
  or spread it across route handlers.

### Implementation steps

1. Inventory every retained router and worker read/write before removing a table
   or enum. This prevents a schema cut from silently dropping a launch feature.
2. Update Drizzle tables, relations, enum values, inferred types, and validation
   together in `packages/db/src/schema/`.
3. Replace `packages/db/supabase/migrations/20260730000000_mvp_baseline.sql` in
   the same change. Do not modify the archive or add migration shims.
4. Retain narrow indexes proven by launch reads: profile/activity date reads,
   calendar ranges, goal dates, source identity, queue claims, and Wahoo work.
5. Retain default-deny RLS, no direct browser table grants, private artifacts,
   fixed-search-path security-definer functions, and service-only credentials.
6. Remove obsolete schema objects only after their callers are deleted. Candidate
   families include duplicate performance authorities, legacy activity identity
   columns, duplicate accepted-artifact fields, and inactive transport-only plan
   fields.
7. Regenerate the schema fingerprint and update fresh-target, RLS, storage, and
   index-plan verification.

### Primary paths

- `packages/db/src/schema/{enums,tables,relations,types}.ts`
- `packages/db/src/validation/index.ts`
- `packages/db/supabase/migrations/20260730000000_mvp_baseline.sql`
- `packages/db/schema-fingerprint.json`
- `packages/db/scripts/{verify-fresh-target,verify-public-table-security}.ts`

### Proof

- Apply the fresh target twice and obtain an empty schema diff.
- Verify RLS/ACLs, storage isolation, ownership, source deduplication, leases,
  and revision publication with live-database tests.
- Benchmark 90-day activity and calendar range reads using the retained indexes.

### Dependency

This plan is implemented once the target data shapes from Plans 3, 3A, 4, 6,
and 7 are settled. It is one coordinated baseline rewrite, not a sequence of
baseline rewrites.

---

## Plan 3 — One athlete-derived-state contract, athlete snapshot, and athlete read model

### Outcome

Normal completed activities update thresholds, load, fitness, fatigue, form,
capabilities, and targets without replaying an athlete's lifetime history. The
API exposes one revisioned `AthleteReadModel` for trends, planning, recording
defaults, home, goals, and profile views.

### Key decisions

- Add a Core `AthleteSportScienceSnapshot` with explicit policy, calculation,
  coverage, and freshness identity.
- Add an API-owned `AthleteReadModel` with bounded published state,
  freshness/rebuild/import status, baseline, versioned load history, profile
  observations, and activity analytics summaries.
- Use one canonical Common Load model and a canonical internal-unit policy.
- Update chronological activity evidence incrementally under the profile lock.
- Use one coalesced, revision-fenced rebuild for imports, corrections, deletions,
  timezone changes, and algorithm upgrades.
- Keep immutable activity evidence for historical/as-of work, but remove it as a
  competing current-state read authority.

### Implementation steps

1. Capture golden fixtures for targets, load, trends, readiness, and planning.
   Resolve conflicting existing load definitions before changing any formula.
2. Add `packages/core/athlete-derived-state/` with quantity, coverage, target, daily
   load, threshold-lifecycle, snapshot, and pure transition contracts.
3. Add these new tables to the fresh baseline: `activity_training_effects` for
   one activity's calculated effect, `daily_training_load` for one athlete-day's
   published load, `athlete_recalculation_queue` for one coalesced rebuild per
   athlete, and `threshold_evidence` for activity-derived threshold support.
   Keep `profile_athlete_state` and `profile_performance_facts` under their
   existing names as the published current state.
4. Replace broad athlete-state repository calls with contribution upsert,
   incremental publish, rebuild claim, rebuild publication, and snapshot reads.
5. Have canonical activity analysis return one typed athlete-derived-state contribution.
6. Implement a fast chronological apply path and make the existing worker
   rebuild-only. Keep lease renewal, retry backoff, revision fencing, and import
   blocking.
7. Build `AthleteReadModel` from the revision-matched snapshot and bounded
   supporting sections. It is the only API current-state read model.
8. Move home, trends, goals, planning, recording defaults, and profile
   performance to `AthleteReadModel`. Delete old replay, raw performance-model,
   separate load-history, and direct live-threshold reads only after all
   consumers move.

### Primary paths

- `packages/core/{athlete-derived-state,load,performance-calibration,performance-model}/**`
- `packages/api/src/application/{athlete-intelligence,performance-model}/**`
- `packages/api/src/application/athlete-intelligence/athlete-read-model.ts`
- `packages/api/src/contracts/athlete.ts`
- `packages/api/src/repositories/{athlete-state,performance-calibration}.ts`
- `packages/api/src/application/activities/**`
- `packages/db/src/schema/**`

### Operational events

Record incremental apply/no-op/rebuild-request outcomes, rebuild reason, revision
lag, queue age, pages replayed, lease loss, and sampled incremental-vs-rebuild
agreement. Do not record athlete or activity identifiers or health values.

### Proof

- Incremental folding equals deterministic batch replay.
- Same-day aggregation is order-independent and duplicate input is a no-op.
- Older corrections cause one coalesced rebuild and stale workers cannot publish.
- Fast-path cost stays flat for athletes with 1, 500, and 10,000 activities.

### Dependency

Plan 4 supplies one canonical activity contribution. Plan 6 consumes the
snapshot for planning and trends.

---

## Plan 3A — Activity-plan structure and Core-owned system content

### Outcome

Reusable workout definitions have one small canonical structure. System templates
are defined, validated, versioned, and tested in Core, then deterministically
seeded into the database without a second SQL or API content corpus.

### Key decisions

- `activity_category` belongs at the root activity-plan structure, not repeated
  per segment.
- A plan has one owner scope. Remove overlapping list flags, sort controls, and
  inactive schema families that are not active persisted structures.
- The canonical response contains `prescriptionQuantification`; clients derive
  duplicate duration, load, confidence, and warning presentation from it.
- Core system content has stable keys, content versions, and deterministic hashes.
  Database seed content is only a validated materialization of those definitions.

### Implementation steps

1. Simplify `packages/core/activity-plan/**` schemas, compilers,
   quantification, fixtures, and exports to the canonical structure.
2. Add a Core system-template catalogue with validity, uniqueness,
   reference-integrity, category, duration/load-bound, compilation, and
   deterministic-hash tests.
3. Update the DB seed projection to materialize Core key, version, and content
   hash. It must not hand-author a parallel content corpus in SQL.
4. Update activity-plan API DTOs, repositories, web/mobile composition, and plan
   pickers to use the simplified structure and quantification bundle.
5. Add Core-to-database seed parity tests, then delete inactive contracts,
   duplicate aliases, old adapters, and compatibility tests.

### Primary paths

- `packages/core/activity-plan/**`, `packages/core/plan/**`
- `packages/api/src/{application/activity-plans,contracts,routers}/**`
- `packages/db/src/schema/**`, baseline seed workflow, and DB verification scripts
- `apps/{web,mobile}/**/activity-plan*`, plan picker and composer components

### Proof

- Core content compiles and quantifies deterministically.
- Seeded database content exactly matches Core key/version/hash output.
- User-created plans retain ownership and edits; system content remains immutable.
- Web/mobile plan selection and scheduling fixtures use the same Core output.

### Dependency

This target structure must be settled before Plan 2 finalizes activity/training
plan persistence and before Plan 6 implements plan preview, commit, and apply.

---

## Plan 4 — Unified activity intake

### Outcome

Every activity source follows the same direct server processing path:

```text
recording, manual file, or Wahoo
  -> one activity_file_ingestions business record
  -> verified staging bytes
  -> parse, derive, and commit in one request
  -> staging cleanup
```

### Key decisions

- `activity_file_ingestions` is the one idempotent business record for every
  manual, mobile, and provider activity intake.
- Manual and mobile retry resubmits the request data against that same record.
  It does not create a job, recover a server-side request, or reconstruct a
  missing payload.
- Provider retries remain in generic `provider_sync_jobs`; provider acquisition
  resubmits the intake request through the same direct-processing path.
- There is no `activity_ingestion_jobs`, `recovery_context`, generic ingestion
  scheduler, cancellation lifecycle, or automatic server reconstruction.
- Preserve canonical activities, segments, efforts, artifact provenance, and
  source identity; eliminate source-specific parse/finalize/cleanup paths.

### Implementation steps

1. Add Core and API intake contracts for the single idempotent business record.
2. Extend `activity_file_ingestions` with request identity, source metadata,
   staging expectation, accepted artifact, and resulting activity. Do not add a
   worker table or generic ingestion queue.
3. Accept complete manual/mobile request data and process it directly through
   one application service. A retry resubmits the data and returns the existing
   result when the request identity already succeeded.
4. Verify staging bytes, parse, derive, promote the artifact, persist the
   canonical activity, write its athlete-derived-state contribution, and clean staging
   bytes in the same bounded request. Cleanup is safe to repeat and never
   exposes private paths or payloads.
5. Make Wahoo acquisition submit the same intake request. Keep provider retry
   ownership in generic `provider_sync_jobs`; do not create provider-specific
   ingestion records beyond `activity_file_ingestions`.
6. Move stream viewing into a focused activity-streams route with the existing
   owner checks.
7. Delete old mobile submission, manual processing, enrichment finalization,
   Wahoo importer, and source-specific cleanup paths after all callers migrate.

### Primary paths

- `packages/core/activity-intake/**` (new)
- `packages/api/src/application/activity-intake/**` (new)
- `packages/api/src/{repositories,infrastructure/repositories}/activity-intake*`
- `packages/api/src/routers/{activity-intake,activity-streams}.ts`
- `packages/api/src/application/activity-file-ingestion/**`
- `packages/api/src/lib/integrations/wahoo/**`
- `apps/{web,mobile}/**/activity-intake*`

### Proof

- Replayed request data returns one operation and one activity; conflicting
  immutable metadata fails.
- Process failure, hash mismatch, parser failure, promotion failure, and an
  ambiguous response are safe to retry only by resubmitting request data; no
  server-side reconstruction occurs.
- Manual FIT/GPX/TCX, mobile recording, and Wahoo input produce the same
  canonical activity result shape.
- Failed or repeated staging cleanup is safe, and telemetry canaries find no
  file, route, payload, or personal data leakage.

### Dependency

Plan 3's contribution contract must be available before final activity commit.
Plan 5 implements mobile delivery against these procedures.

---

## Plan 5 — Simplified mobile recorder

### Outcome

The app retains free and planned recording, pause/recovery, GPS, BLE, FTMS,
offline upload, and FIT export with one lifecycle authority and one durable local
store.

### Key decisions

- The Core reducer is the only lifecycle authority.
- A single app-level coordinator serializes commands, persists a reducer revision,
  starts effects, and feeds effect outcomes back into the reducer.
- SQLite holds session state, evidence chunks, final artifacts, delivery work, and
  recovery state. Existing recorder persistence is reset at the hard cut.
- GPS, BLE, FTMS, FIT generation, and delivery are effects. They cannot mutate
  recording lifecycle state directly.

### Implementation steps

1. Extend `packages/core/recording/` with state, commands, effects, and failure
   transitions for start, pause, finalize, review, queue, delivery, and discard.
2. Add the SQLite session, chunk, effect, artifact, delivery, quarantine, and
   active-capture tables under `apps/mobile/lib/recording/intake/`.
3. Add a serialized coordinator and expose selectors/commands through
   `ActivityRecorderProvider`, not service internals or event emitters.
4. Wrap the proven BLE/GATT/FTMS code behind ports. Keep its serialization,
   reconnect, control-loss, and late-settlement protections.
5. Use one foreground GPS effect and one fenced headless task. Do not persist
   samples while paused; deduplicate the short foreground/background handoff.
6. Stop producers, fence SQLite evidence, then stream chunks into a temporary FIT
   file during finalization. Validate and atomically promote the result.
7. Add one delivery owner for review, retry, upload, polling, acceptance, and
   cleanup against Plan 4. Remove retry ownership from upload helpers and hooks.
8. Migrate record screens, cockpit, plan/route actions, and indicators to the
   coordinator. Delete old service, journal, checkpoint, stream buffer, queue,
   and startup-recovery paths.

### Primary paths

- `packages/core/recording/**`
- `apps/mobile/lib/recording/intake/**` (new)
- `apps/mobile/lib/services/ActivityRecorder/**` (replacement/deletion)
- `apps/mobile/lib/services/{SensorsManager,DeviceGattQueue,FTMSController}/**`
- `apps/mobile/lib/recording/**`, `apps/mobile/components/recording/**`
- `apps/mobile/app/(internal)/record/**`

### Proof

- Reducer state table, stale-event, retry, discard, and recovery tests.
- Native SQLite interruption tests at every session/chunk/artifact/job boundary.
- FIT round trips, corruption quarantine, and duplicate delivery proof.
- Physical iOS/Android checks for locking, backgrounding, permissions, process
  eviction, Bluetooth reconnect, trainer control, battery, and queue recovery.

### Dependency

Plan 4's activity intake API is required. The mobile local-data reset must be
explicitly approved before release because it discards old unsent recordings.

---

## Plan 6 — Calendar-authoritative planning

### Outcome

Both applications read one bounded planning response. Its figures are clear and
never double count completed sessions:

- **actual:** completed activity evidence;
- **committed:** active future scheduled work;
- **target:** the original recommended plan prescription; and
- **effective:** actual plus remaining committed work.

### Key decisions

- Create one `PlanningRange` contract with days, weeks, trajectories, coverage,
  goals, and calendar items.
- A date-based scheduled session has only a planning date. A timed event has
  instants plus an event-owned IANA timezone. Device timezone only affects display.
- Training-plan application creates calendar scheduled sessions; it never creates
  a second editable live schedule.
- Support bounded weekly materialized recurrence. Keep single-occurrence and
  series cancellation; defer recurrence-rule editing and unsupported series edits.

### Implementation steps

1. Add Core scheduled-session, time-kind, recurrence, and `PlanningRange`
   contracts with 366-day maximum ranges and explicit coverage states.
2. Replace overloaded personal scheduling persistence with strict scheduled-session
   and personal-event authorities in the fresh baseline. Preserve separate group
   event authorization and projection as the accepted model requires.
3. Build one repeatable-read API service that loads sessions, completed activity
   facts, goals, relevant events, athlete snapshot, and recommendations into the
   Core composition once.
4. Make `calendar.range` use that response. Make `calendar.day` use the same
   service for a one-day range.
5. Replace training-plan writes with explicit
   `trainingPlans.preview({ kind, draft })` and
   `trainingPlans.commit({ kind, draft, basePublishedRevision })` procedures.
   `commit` recalculates under authorization, a published-revision advisory
   fence, structure/revision compare-and-set, linked-plan locks, and one
   transaction. A preview is UI feedback only and can never be persisted as
   authority.
6. Convert training-plan application so applied sessions retain target date and
   prescription snapshots. Moving a session must not rewrite the original target.
7. Update web and mobile Plan, calendar, agenda, event forms, day details, and
   training-path components to consume the discriminated server model directly.
8. Delete Plan-tab projection, planning-ledger, effective-load, local joining,
   broad event payloads, old recurrence payloads, and obsolete invalidation logic.

### Primary paths

- `packages/core/calendar/**`
- `packages/api/src/application/{planning,calendar,training-plan}/**`
- `packages/api/src/routers/{events,planning}.ts`
- `packages/api/src/{repositories,infrastructure/repositories}/**event*`
- `packages/db/src/schema/**`
- `apps/web/src/{routes/_protected/plan.tsx,routes/_protected/calendar/**,components/planning/**}`
- `apps/mobile/app/(internal)/**`, `apps/mobile/components/{calendar,plan,event}/**`

### Proof

- No double count after a completion link and correct moved-target semantics.
- Incomplete data never displays as zero.
- Preview and commit agree for create, update, duplicate, stale published state,
  linked activity-plan availability, and concurrent writes.
- UTC−12 through UTC+14, DST gaps/folds, travel, timed-event zones, recurrence,
  cancellation, and completion linking all pass.
- Every recurring scheduled session persists `occurrenceKey` as its planning date.
- Web/mobile fixture parity proves ordering, labels, and values match.

### Dependency

Plan 3 supplies athlete snapshot/load facts. The database baseline must support
the final session model before clients move.

---

## Plan 7 — Provider reliability and onboarding hardening

### Outcome

Provider connection, history import, webhook activity import, planned-workout
sync, disconnect, and onboarding are reliable while retaining the existing
abstract provider architecture and onboarding lifecycle.

### Mandatory evidence gate

Before implementing the provider cut, run a redacted Wahoo sandbox study and
store only safe fixtures that prove OAuth scopes, refresh rotation, webhook
payload/authentication and edits, rate limits, pagination, FIT download behavior,
planned-workout create/update/delete, ambiguous response recovery, and disconnect
semantics. Stop if a security or recovery property remains unknown.

### Key decisions

- Keep the provider registry, shared integration contracts, provider-neutral
  queue/source identity, and adapter boundary. Wahoo remains the first provider
  hardened through those abstractions, not a replacement for them.
- Each provider adapter owns its OAuth/provider API details; shared runtime code
  owns credential protection, deadlines, retries, response validation, refresh
  locks, generation fencing, and safe telemetry.
- Keep the current onboarding states and transitions. Add read-model health and
  progress projections only as non-authoritative observability/supporting views.

### Implementation steps

1. Add credential-gated Wahoo sandbox tests and capture the evidence gate.
2. Strengthen the existing provider gateway/adapter boundary with fixed provider
   callback routes where appropriate, safe setup/overview read models, and shared
   provider operations.
3. Keep provider-neutral sync jobs and webhook receipts. Add generation fences,
   work keys, leases, retries, retention, payload clearing, and adapter-owned
   provider-specific validation without replacing the generic queue model.
4. Make calendar mutations enqueue desired planned-workout reconciliation through
   the existing provider adapter dispatch. Do not remove generic dispatch.
5. Make history and webhook acquisition create Plan 4 intake operations rather
   than writing activities themselves.
6. Preserve onboarding transitions, retry, restart, and recovery behavior. Add
   bounded health/progress reporting so an interrupted provider flow is visible
   and recoverable without changing its product semantics.
7. Remove only duplicated or unsafe provider/onboarding implementation paths after
   a caller inventory proves they are redundant. Do not remove provider registries,
   generic callbacks, adapter dispatch, or onboarding states.

### Primary paths

- `packages/api/src/lib/integrations/wahoo/**`
- `packages/api/src/{application/integrations,application/onboarding}/**`
- `packages/api/src/lib/{integrations,provider-sync}/**`
- `packages/api/src/{repositories,infrastructure/repositories}/**integration*`
- `packages/api/src/routers/{integrations,onboarding}.ts`
- `apps/web/src/routes/api/integrations/callback/**`
- `apps/{web,mobile}/**/*wahoo*`, `apps/{web,mobile}/**/*onboarding*`

### Proof

- Sandbox, OAuth, refresh race, webhook edit/redelivery, history pagination,
  rate-limit, worker lease, planned-workout ambiguity, and disconnect tests for
  Wahoo without weakening provider-neutral contract coverage.
- Live-database generation fencing, tenant isolation, queue retention, and source
  identity tests.
- Web/mobile connect, skip, progress, retry, review, completion, sync, and
  disconnect journeys preserve current onboarding state transitions.

### Dependency

Plan 4 must accept Wahoo acquisition. Plan 6 supplies desired scheduled sessions
for planned-workout reconciliation.

---

## Plan 8 — Thin API, focused cache, and one authorization decision

### Outcome

The API is easy to change safely: routers are thin, outputs are explicit, errors
are consistent, authorization is centralized, and mutations refresh only the
views they affect.

### Key decisions

- Organize tRPC around feature modules: account, athlete, activities, planning,
  integrations, and only the accepted social/group features.
- Every public procedure has strict input and output DTOs. Application and
  repository layers never construct tRPC errors.
- Use one finite error vocabulary: unauthenticated, forbidden, not found,
  conflict, invalid input, rate limited, unavailable, and internal.
- Use one `authorize()` decision service plus owner predicates in repository
  queries. For revocation-sensitive operations, authorize and mutate in the same
  transaction.
- Replace global cache flushing with typed mutation receipts and exact cache tags.

### Implementation steps

1. Create feature DTO modules and a router error mapper. Move route-local
   database orchestration into application services and repositories.
2. Add `application/access/authorize.ts` and replace parallel content, coaching,
   group, and route-local checks only where their product policy is already
   accepted. Preserve `private`, `followers`, and `public` values through every
   API/app round trip. Do not reduce group/social scope, public-user routes, or
   member-list visibility without a separate decision.
3. Define cache tags and a web/mobile shared tag-to-tRPC-key adapter. Each mutation
   returns entity, revision, affected dates where needed, and exact invalidation
   tags.
4. Remove broad scheduling and post-ingestion refresh lists, path-inspecting
   invalidation, and cross-feature refetches.
5. Keep one shared QueryClient factory for safe defaults while web/mobile root
   providers retain their own lifecycle behavior.
6. Remove unused contract-epoch compatibility machinery after the single approved
   hard cut and local-data reset have occurred.
7. Delete obsolete procedures, DTOs, cache helpers, and client callers after the
   replacement journeys are green.

### Primary paths

- `packages/api/src/{routers,contracts,application,repositories}/**`
- `packages/api/src/{trpc,query-client,react}.ts`
- `packages/api/src/permissions/**`
- `apps/web/src/lib/api/**`, `apps/mobile/lib/{api,providers,hooks}/**`

### Proof

- Contract tests expose only supported procedures, DTO fields, and errors.
- Live-database authorization matrix covers owner, authorized group/social actor,
  and denied actor cases.
- Web/mobile tests prove each supported visibility value survives read, edit,
  hydration, persistence, and cache refresh unchanged.
- Cache tests prove a mutation refreshes the relevant active views only.
- Web/mobile journeys cover profile, activity detail/RPE, plan preview/commit,
  calendar range/day, Wahoo sync, and accepted visibility behavior.

### Dependency

Implement this incrementally around the replacement contracts in Plans 3, 4, 6,
and 7. Finish only after their old procedures are removed.

---

## Cross-plan completion evidence

The simplification program is complete only when:

1. The athlete snapshot is the sole current-state read source for dashboards,
   planning, goals, trends, and recording defaults.
2. Activity input remains safe across crash, replay, lease loss, source redelivery,
   and cleanup retry.
3. Calendar and Plan agree across timezones, recurrence, cancellation, and
   completed-session replacement.
4. Web and mobile provide the same supported user journeys and terms.
5. Authentication and telemetry are privacy-safe by automated canary tests.
6. Fresh-baseline, live-database, Core/API/web/mobile checks, and
   `pnpm quality:agent` pass on the supported Node version.

## Delivery boundaries

This plan authorizes no database reset, data deletion, deploy, release, push, or
external Wahoo configuration change. Each requires a separate explicit decision.

## Schema plan: existing names and new tables

### Existing tables: keep their names

`profiles`, `activities`, `activity_artifacts`, `activity_segments`,
`activity_source_references`, `activity_file_ingestions`, `activity_plans`,
`training_plans`, `events`, `profile_goals`, `profile_athlete_state`,
`profile_performance_facts`, provider tables, and onboarding tables retain their
current names. The plan may add constraints or retire duplicate fields, but it
does not rename them.

### New tables: one purpose each

| New table | Concrete purpose | Why it exists |
| --- | --- | --- |
| `activity_training_effects` | Stores the calculated training-load and athlete-state effect of one completed activity. | A newly completed activity can update current state quickly, while deleting or changing it identifies exactly what must be recalculated. |
| `daily_training_load` | Stores the published load, fitness, fatigue, and readiness result for one athlete on one planning date. | Trends, charts, goals, and planning read a small date range instead of replaying every activity. |
| `athlete_recalculation_queue` | Stores at most one pending recalculation per athlete, beginning at the earliest affected activity date. | Many edits, imports, or deletions combine into one safe rebuild rather than competing jobs. |
| `threshold_evidence` | Links a threshold or performance fact to the activity evidence that supports it. | Deleting an activity removes its evidence, allowing the rebuild to select valid remaining threshold evidence. |
| `planned_sessions` | Stores the actual date-based future workout schedule, its prescription, cancellation state, and optional completed-activity link. | `training_plans` remain templates; one table becomes the authoritative future calendar schedule. |

### Required changes to existing tables

| Existing table | Change | Why |
| --- | --- | --- |
| `profile_athlete_state` | Keep it as the one published current-state record; retain revision, lease, dirty-date, and recovery-cursor fields. | All current athlete reads use one coherent revision and interrupted calculation can resume safely. |
| `profile_performance_facts` | Keep current threshold facts here and tie their support to `threshold_evidence`. | The current threshold remains quick to read while its source remains explainable and removable. |
| `activity_file_ingestions` | Extend it to represent the single idempotent intake business record for recordings, uploads, and provider activity acquisition. | There is one request identity, ownership rule, and retry rule without a worker table or generic ingestion scheduler. |
| `training_plans` | Keep reusable plan structure and original prescription; stop using it as the editable future schedule. | A plan cannot drift from the calendar sessions created from it. |
| `events` | Keep its current name and retain approved event behavior; remove only overlapping future-workout authority after `planned_sessions` is live. | Existing event features remain stable while planned workouts gain a clear owner. |
| `activity_artifacts` and `activity_source_references` | Keep them as the accepted file and source-of-truth links. | File provenance and provider deduplication remain intact. |

### New-table responsibilities, inputs, and consumers

| New table | Exact responsibilities | Inputs | Downstream consumers |
| --- | --- | --- | --- |
| `activity_training_effects` | Store the deterministic result of analyzing one accepted activity: its effective timestamp, training load, calculation version, input fingerprint, and the athlete-state change it contributes. It is immutable for a specific activity-analysis revision and is removed or superseded when that evidence is replaced. It does not store raw streams, editable athlete state, or queue leases. | Canonical accepted `activities`, `activity_segments`, immutable analysis result, and the calculation policy/version. | Incremental athlete-state publication; rebuild worker; `daily_training_load` materialization; training-plan actual-load calculation; activity-detail explanation. |
| `daily_training_load` | Store the published end-of-day athlete result for one athlete and planning date: total load, fitness, fatigue, form/readiness, coverage, source revision, and calculation version. Replace all rows from the recalculation start date forward in one fenced publication. It does not accept manual edits or retain individual activity detail. | Ordered `activity_training_effects`; current `profile_performance_facts`; athlete calculation policy; rebuild or incremental publisher. | Athlete trends and home read model; goal assessment; `calendar.planningRange`; plan charts; recording defaults that use recent load. |
| `athlete_recalculation_queue` | Hold one coalesced request per athlete to rebuild derived athlete state. Preserve the earliest affected timestamp, source revision, reason set, request time, lease, retry count, and terminal failure information. It does not contain calculated athlete results. | Activity create/edit/delete; analysis replacement; threshold change; import completion; algorithm or timezone change; explicit repair request. | Athlete rebuild worker; athlete-state freshness/read-status projection; safe retry and operational telemetry. |
| `threshold_evidence` | Record which accepted activity evidence supports a threshold fact, with sport, fact kind, effective timestamp, confidence, calculation version, and supersession/deletion status. It is evidence history, not the current threshold value. | Accepted activity analysis, user-entered verification activity where supported, and threshold reconciliation rules. | Threshold reconciliation; `profile_performance_facts` publication; athlete rebuild; threshold explanation; deletion/correction invalidation. |
| `planned_sessions` | Store the one authoritative future date-based workout schedule: athlete, planning date, activity-plan prescription snapshot, originating training-plan reference, occurrence identity, status, cancellation reason, and optional completed-activity link. It is editable future schedule state, not a reusable template or a generic timed event. | Training-plan apply/commit; direct calendar scheduling; recurrence materialization; move/cancel actions; activity completion linking. | Calendar day/range reads; `calendar.planningRange`; agenda and plan screens; provider planned-workout reconciliation; completion matching; plan adherence reporting. |

### Existing-table interfaces required by the new tables

| Existing table | Responsibility in this design | Inputs | Downstream consumers |
| --- | --- | --- | --- |
| `profile_athlete_state` | Publish the current revisioned athlete snapshot and calculation/recovery status. It is the only normal current-state authority. | Incremental publisher or fenced rebuild publication; `athlete_recalculation_queue` status. | Athlete read model; home, trends, goals, planning, recording defaults, and freshness messaging. |
| `profile_performance_facts` | Publish the current selected threshold/performance values for each athlete and sport. | Threshold reconciliation from `threshold_evidence`; authorized direct settings where supported. | Athlete read model; activity analysis; activity-plan quantification; training targets; recording guidance. |
| `activity_file_ingestions` | Remain the one idempotent business record for one incoming recording, upload, or provider activity, including owner, request identity, source, staging expectation, accepted artifact, and resulting activity. | Complete manual/mobile request data; provider acquisition request; retry resubmission. | Intake status API; direct verification/parse/derive/commit; staging cleanup. |
| `training_plans` | Retain reusable plan structure and original prescription; never become the editable future schedule after application. | Plan authoring and revision-safe plan commit. | Plan library/detail; preview; creation of `planned_sessions`; historical target comparison. |
| `events` | Retain approved generic event behavior and timed-event semantics. It does not own future workout scheduling once `planned_sessions` is live. | Existing event creation, groups, and approved calendar behavior. | Existing event views and group/event features; calendar composition alongside planned sessions. |
