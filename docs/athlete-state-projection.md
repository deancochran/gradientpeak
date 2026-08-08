# Athlete state and activity-import implementation plan

## Delivery boundary

This plan applies to local-only work in `feature/athlete-state-projection`, based on
`f340fde4275743cfc13bc4835919c484b3d61cd6`. It replaces the uncommitted
`profile_state_inputs` / state-run / checkpoint design before it becomes a
deployable migration. Do not commit, push, deploy, reset a shared database, or
change `dev` as part of this work.

The product uses a hard-cut database policy. Legacy data, compatibility columns,
and JSON-schema compatibility are not supported. New schema work targets a fresh
database only; any database reset requires explicit target-specific authorization.

For activity plans and training plans, `content_visibility` is the single
canonical public-visibility field. `template_visibility` and any fallback or
dual-write behavior are legacy compatibility and must be removed.

## Product decisions

- GradientPeak owns derived performance conclusions. Provider values for VO2 max,
  LTHR, FTP, training load, training effect, zones, fitness, fatigue, or readiness
  are not imported as authoritative metrics.
- Providers contribute canonical raw activity evidence: timing, duration, distance,
  streams, summaries, artifacts, and source provenance.
- Completed activities and material effort changes are the only sources that
  invalidate persistent observed athlete state.
- `profile_metrics` are observations and configuration/reference data. They do not
  directly trigger athlete-state replay. `max_hr` remains a profile metric/reference
  value, preferably derived by GradientPeak from trustworthy raw HR evidence.
- Performance estimates are GradientPeak-derived current outputs. Planned sessions
  can affect only a pure in-memory scenario, never observed athlete state.
- Calendar Scheduled Sessions are the sole authoritative future schedule. A training
  plan is a reusable template or batch that creates scheduled sessions; it is not a
  second independently authoritative live schedule.
- An activity plan is the reusable workout definition. A scheduled session may
  reference an activity plan, and a completed activity records the evidence of its
  completion. Do not duplicate scheduling authority in training-plan structure and
  calendar events.
- Core owns canonical system-template and content definitions, validation, and test
  fixtures. Database seeding is a validated projection of those Core definitions,
  never an independent runtime template corpus or source of content truth.
- Activities may be visible before a history import completes. Athlete state is not
  published as fresh from an incomplete bulk import.
- The import schema and canonical-source workflow are provider-neutral. A provider
  integration is enabled as a whole only when its required server environment
  configuration is present; without that configuration it is completely disabled.

## Keep existing provider infrastructure

Retain the current provider queue, receipt, and fencing model:

```text
integrations
integration_credentials
provider_sync_state
provider_sync_jobs
provider_webhook_receipts
activities
activity_segments
activity_efforts
```

Do not create another queue or one job per activity. Provider jobs continue to
provide per-integration serialization, generation fencing, receipt recovery, retry,
and lease ownership.

## Provider enablement

Operational provider sync is intentionally Wahoo-only. Wahoo availability is
configuration-driven, not a separately persisted or user-configured capability state:

```text
required Wahoo environment variables present  → Wahoo integration enabled
required Wahoo environment variables absent   → Wahoo integration disabled
```

Enabled Wahoo exposes its complete supported integration flow. Disabled Wahoo does
not expose OAuth, import, sync, retry/requeue, or background work. Do not add a second
feature flag, provider-capability table, generic runtime adapter registry, or partial
enabled state. Provider-neutral enums, capability descriptions, source references,
and import runs do not authorize operational support for another provider.

The Wahoo importer supplies:

```text
provider external identity
trusted origin identity when the provider supplies it
artifact digest when an exact downloaded artifact exists
canonical raw activity evidence
```

Wahoo uses the canonical source-resolution order and material-change contract in
this document. Provider-neutral conformance tests prove shared ingestion behavior;
Wahoo-specific tests prove the only enabled provider ingress.

## Schema

### `activity_import_runs`

Create one row per user-visible onboarding import, provider history sync, or manual
sync. A webhook is a direct delta activity write and never creates an
`activity_import_runs` row; its receipt and provider job own delivery recovery.

```text
id                         UUID primary key
profile_id                 UUID not null -> profiles.id
integration_id             UUID nullable -> integrations.id for the same profile
integration_generation     BIGINT nullable
kind                       onboarding | history_sync | manual_sync
status                     queued | running | completed | failed | cancelled
window_start_at            TIMESTAMPTZ nullable
window_end_at              TIMESTAMPTZ nullable
next_cursor                TEXT nullable
next_page                  INTEGER nullable
discovered_count           INTEGER not null default 0
imported_count             INTEGER not null default 0
skipped_count              INTEGER not null default 0
failed_count               INTEGER not null default 0
material_change_count      INTEGER not null default 0
earliest_activity_at       TIMESTAMPTZ nullable
latest_activity_at         TIMESTAMPTZ nullable
material_effective_from_at TIMESTAMPTZ nullable
started_at                 TIMESTAMPTZ nullable
completed_at               TIMESTAMPTZ nullable
last_error_code            TEXT nullable
created_at                 TIMESTAMPTZ not null
updated_at                 TIMESTAMPTZ not null
```

Constraints:

```text
all count fields are non-negative
next_page is null or >= 1
next_cursor and next_page cannot both be set
integration_id and integration_generation are both null or both non-null
terminal statuses require completed_at
```

Indexes:

```text
(profile_id, status, updated_at desc)
(integration_id, status, updated_at desc) where integration_id is not null
```

Allow queued imports, but permit only one running bulk-history import per profile:

```text
unique profile_id where status = running
  and kind in (onboarding, history_sync, manual_sync)
```

This deliberately serializes initial/history imports for a single athlete while
allowing imports for different athletes to run in parallel.

### `activity_source_references`

Create an activity-specific source-reference table. Do not overload generic
resource linking with canonical activity identity.

```text
id                         UUID primary key
profile_id                 UUID not null -> profiles.id
activity_id                UUID not null -> activities.id for the same profile
integration_id             UUID not null -> integrations.id for the same profile
provider                   TEXT not null
provider_external_id       TEXT not null
provider_revision          TEXT nullable
origin_provider            TEXT nullable
origin_external_id         TEXT nullable
artifact_sha256            TEXT nullable
last_import_run_id         UUID nullable -> activity_import_runs.id
last_material_import_run_id UUID nullable -> activity_import_runs.id
last_material_effective_at TIMESTAMPTZ nullable
created_at                 TIMESTAMPTZ not null
updated_at                 TIMESTAMPTZ not null
```

Constraints and unique indexes:

```text
provider and provider_external_id are non-empty
origin_provider and origin_external_id are both null or both non-null
artifact_sha256, when present, is a SHA-256 hex digest
unique(profile_id, provider, provider_external_id)
unique(profile_id, origin_provider, origin_external_id)
  where both origin fields are present
unique(profile_id, artifact_sha256)
  where artifact_sha256 is present
```

One canonical activity may have many source references. Generic resource links are
not activity identity and must not be read or written by activity import,
artifact retrieval, or canonical submission flows.
Enforce profile ownership with composite foreign keys to `(activity_id, profile_id)`
and `(integration_id, profile_id)` where the referenced tables expose those unique
pairs; otherwise add the necessary unique pairs as part of this migration. The same
profile-scoped integration ownership rule applies to `activity_import_runs`.

### `profile_athlete_state`

Persist one current published observed state per profile.

```text
profile_id                 UUID primary key -> profiles.id
source_revision            BIGINT not null default 0
published_revision         BIGINT not null default 0
dirty_from_at              TIMESTAMPTZ nullable
fitness                    NUMERIC not null default 0
fatigue                    NUMERIC not null default 0
evidence_confidence        NUMERIC not null default 0
coverage_start_at          TIMESTAMPTZ nullable
coverage_end_at            TIMESTAMPTZ nullable
last_activity_at           TIMESTAMPTZ nullable
algorithm_version          TEXT not null
computed_at                TIMESTAMPTZ nullable
lease_token                UUID nullable
lease_expires_at           TIMESTAMPTZ nullable
retry_after                TIMESTAMPTZ nullable
consecutive_failures       INTEGER not null default 0
last_failure_code          TEXT nullable
updated_at                 TIMESTAMPTZ not null
```

Constraints:

```text
source_revision >= published_revision
fitness >= 0
fatigue >= 0
0 <= evidence_confidence <= 1
consecutive_failures >= 0
lease_token and lease_expires_at are both null or both non-null
```

Do not persist form:

```text
form = fitness - fatigue
```

Freshness is inferred rather than stored as another state machine:

```text
published_revision = 0                         unavailable
source_revision > published_revision           pending/updating
lease_token present                            rebuilding
source_revision = published_revision
  and dirty_from_at is null                    current
```

### `profile_performance_estimates`

Persist only current GradientPeak-derived performance estimates.

```text
profile_id                 UUID not null -> profiles.id
capability_kind            TEXT not null
activity_category          TEXT not null
value                      NUMERIC not null
unit                       TEXT not null
confidence                 NUMERIC not null
effective_at               TIMESTAMPTZ not null
evidence_window_start_at  TIMESTAMPTZ nullable
evidence_window_end_at    TIMESTAMPTZ nullable
algorithm_version          TEXT not null
source_revision            BIGINT not null
computed_at                TIMESTAMPTZ not null
primary key(profile_id, capability_kind, activity_category)
```

Examples include `run_vo2_max`, `run_lthr`, `run_threshold_pace`,
`run_critical_speed`, `bike_ftp`, and `bike_critical_power`.

### Plan revisions

Retain only:

```text
training_plans.revision
training_plans.validated_state_revision
training_plans.validated_at
training_plans.projection_algorithm_version
```

Remove run-ID coupling such as `based_on_state_run_id`.

## Canonical activity resolution

Resolve imports in this order:

```text
1. Existing profile + provider + provider external ID source reference.
2. Trusted profile + origin provider + origin external ID reference.
3. Exact profile + artifact SHA-256 reference.
4. Otherwise create a canonical activity and source reference.
```

Never automatically merge activities based only on timing, distance, duration, or
title. On unique-insert conflict, re-read the winning source reference and attach
the source to its canonical activity.

`activity_source_references` is the sole activity provider-identity authority.
Canonical activity rows and `integration_resource_links` carry no activity provider
identity. Exact-redelivery shortcuts must still run source-reference attachment so
missing trusted-origin or artifact metadata heals.

Use deterministic evidence priority:

```text
raw FIT stream > raw samples > provider summary > inferred fallback
```

Persist the selected tier on the canonical activity and permit replacement only by
equal- or higher-tier evidence. Origin keys are eligible for convergence only when
an internal adapter explicitly classifies them as trusted provider-origin
provenance; arbitrary payload origin fields are rejected.

A duplicate source attachment does not touch athlete state. A material canonical
change to duration, distance, streams, segments, effort, or Common Load does.
Artifact identity changes, canonical segment-content changes, accepted raw-sample
revisions, and evidence-tier upgrades are material even when their reduced load,
duration, distance, or effort outputs happen to remain numerically equal.
Generated `activity_efforts` inserts, updates, and deletes participate in the same
material marker and therefore coalesce into the import run's single completion
refresh rather than publishing independently.
Direct re-delivery may fill previously absent trusted-origin or artifact-digest
metadata after consistency checks; metadata enrichment alone remains state-neutral.

## Import-run workflow

1. OAuth connect, onboarding, manual sync, or scheduled sync enqueues the existing
   provider job. A queued provider job does not yet claim an import run or establish
   an athlete-state freshness fence. Webhook deltas use the ordinary canonical
   activity path and touch athlete state directly when they materially change
   canonical evidence.
2. After claiming the provider job, a history worker creates or reuses the
   kind-specific import run, binds it to the claimed job, then starts one running
   bulk import for the profile and processes a bounded number of pages per lease.
   The queued/running import run becomes the freshness fence at that durable bind.
3. Each page imports activities through the existing canonical `submitActivity`
   path with `importRunId` and `deferAthleteStateRefresh = true`.
4. Activities and activity efforts commit individually and are immediately visible.
   Canonical submission returns whether it materially changed athlete evidence. The
   import-run row aggregates `material_change_count` and
   `earliest_material_activity_at`; it does not create per-item import records. The
   run advances counts, cursor/page, and those aggregate fields only after a page
   completes successfully.
5. On crash, the page can repeat safely because source-reference identity is
   durable. Cursor/page advancement happens only after page completion.
6. On final page, one transaction marks the run complete and only when the durable
   `material_change_count` is nonzero increments
   `profile_athlete_state.source_revision` once, and moves `dirty_from_at` to the
   earliest material effective time.
7. On terminal provider failure, mark the run failed with a bounded error code.
   Keep successfully imported activities visible, but do not publish partial
   training history as fresh athlete state.

Replace fixed page/item history failure caps with bounded per-execution work plus
resume through `next_cursor` or `next_page`.

Webhook activity and effort changes invalidate athlete state in the canonical source
transaction. Provider receipts/jobs own recovery and fencing, and exact retry is a
state-neutral no-op.

## Athlete-state worker

The existing authenticated provider-sync drain remains the worker entrypoint.

Claim only a profile whose:

```text
source_revision > published_revision
dirty_from_at is absent or due at the replay as-of
retry_after is absent or due
profile has no queued/running bulk import run
```

Worker flow:

```text
claim profile lease and capture source revision
→ keyset-page complete canonical Common Load/activity capability inputs
→ renew the database-time lease between replay pages and stop on any lost fence
→ read effort estimates only when both recorded_at and their completed activity finished_at are <= as-of
→ use the same planning timezone/day policy as planning
→ calculate fitness, fatigue, confidence, and performance estimates
→ conditionally publish only if lease token and source revision still match
```

The worker passes explicit `YYYY-MM-DD` planning-day boundaries into Core state
transitions. Core counts calendar-day identities rather than UTC epoch buckets, so
local midnight and DST offset changes each advance exactly by the applicable local
dates; callers that omit boundaries use an explicit UTC-calendar default.
Plan simulation receives the profile planning timezone from server and client
profile settings, aggregates projected sessions by that local day, and passes the
same explicit day boundaries through Core transitions and final decay.
Replay leases use a fixed five-minute ownership window, independent of provider-job
lease configuration. The complete-evidence keyset query is backed by the partial
`activities(profile_id, finished_at, id)` replay index over rows with all required athlete-state
evidence fields present. Capability replay uses `activity_efforts(profile_id, id)`;
disposable multi-profile plans must select both replay indexes without sequentially
scanning their replay tables.
Goal target dates resolve to the final millisecond of that date in the same planning
timezone; they are never interpreted as UTC date ends.

The publish transaction upserts performance estimates and sets:

```text
published_revision = captured revision
dirty_from_at = earliest observable future activity/effort evidence, or null when none remains
computed_at = now
lease fields = null
failure fields reset
```

Bulk-run creation/start and athlete-state publication share one profile advisory
fence. Once a claimed provider job creates its run, publication rechecks
queued/running bulk runs while holding that fence, so that import linearizes before
publication or immediately makes the resulting state non-fresh. Provider-queue wait
time before job claim is intentionally outside this fence. A failed bulk run is not
silently ignored: the API reports its history as incomplete even if a later direct
activity refreshes the available-data state. Failed runs do not block replay or
publication of available evidence; only queued/running bulk runs do.

Publication that observes complete future-dated activity evidence or an attached
future-recorded effort retains a new pending source revision. Effort observability
is `greatest(activity.finished_at, effort.recorded_at)`, and material-change markers
normalize each changed effort to that same parent-bounded instant before selecting
the earliest actual activity/effort effective time. The due predicate prevents that
revision from being claimed early, and the worker replays it once observable.

If the source revision or lease changed, publish nothing. On failure, clear the
lease, increment bounded failure state, set retry backoff, and retain the last
published state.

The worker must not use the generic bounded athlete-intelligence reader, raw
segments, provider-derived metrics, UTC date slicing, or an implicit 180-day/120-
activity history cap.

## API and UI

### Delegated coach access

Delegated coaches may read an athlete's full published current-athlete baseline
and current GradientPeak-derived performance estimates. This access remains
profile-scoped and follows the existing delegated-profile authorization model.
It does not grant access to raw provider credentials, raw artifacts, provider
delivery receipts, or other integration operational data.

Server-only Wahoo configuration plus centralized Wahoo reconciliation admission is
the runtime authority for OAuth, overview availability, sync admission, webhook
receipt, queue admission, retry, and drain. Core provider capability metadata is
descriptive and never enables another runtime integration. A persisted Wahoo
integration remains visible and locally disconnectable if Wahoo is later disabled.

Extend existing integration sync overview with import-run and athlete-state
freshness. Add an activity-list filter by `importRunId`, resolved through
`activity_source_references.last_import_run_id`.

Return states that distinguish:

```text
activities importing
activities imported but state pending
state rebuilding
state current
history incomplete after failed import
```

Goal assessment reads only published athlete state, current GradientPeak
performance estimates, selected goal, and bounded plan context. Retire or isolate
the old raw runtime intelligence endpoint after caller migration.

Goal assessment and planning baseline, view, and save validation share one
application-level published snapshot interpretation: profile planning timezone and
current local date, source and published revisions, freshness/rebuild status, bulk
history completeness, evidence coverage, and the read-time-decayed published
baseline. UTC is used only when the profile has no planning-timezone preference.
Failed bulk history remains available for local draft simulation but blocks
authoritative plan validation.

Authoritative plan save and bulk-import creation share the profile advisory fence.
Every participant acquires it before plan, athlete-state, or import-run row locks;
this fixed order avoids deadlock and makes import admission versus validation one
serial decision. Local draft simulation remains outside this authoritative fence.

Freshness calculation must also inspect failed relevant bulk import runs. A failed
run may leave successfully imported activities visible, but it cannot be presented
as complete/fresh training history until it is retried, superseded, or explicitly
cancelled with the resulting coverage limitation still shown.

Current observed-state output is **current goal preparedness**. Reserve
**projected event readiness** for an explicit plan scenario evaluated through a
goal target date.

## Deferred scope

Do not add now:

```text
profile_state_inputs
state runs or candidate checkpoint history
per-import-item rows
one provider job per activity
persisted plan scenario outputs
daily athlete-state rows
historical state chart persistence
generic profile-metric state invalidation
```

If history charts are later needed, calculate bounded history on demand and cache
by profile revision and algorithm version. Add sparse seeds only after measurement
shows full background replay is too slow.

## Required proof

- 500-activity onboarding import produces one completed import run and one state
  refresh.
- History imports resume beyond prior page/item limits.
- Activities are visible before a batch completes.
- Failed batches preserve activities and remain incomplete/stale while allowing an
  available-data athlete-state publication.
- Retried pages do not duplicate activities or Common Load.
- Provider-neutral trusted-origin concurrent source attachments converge to one
  canonical activity with multiple source references. Each enabled provider also
  proves its own ingress adapter against that shared contract.
- Same raw external ID from unrelated providers does not merge without trusted
  origin/artifact evidence.
- Duplicate source attachment does not change athlete-state revision; better raw
  evidence causes one material refresh.
- State cannot publish while a bulk import is active, after a lost lease, or after
  a newer revision arrives.
- Profile metric writes alone do not invalidate observed athlete state.
- State replay includes history beyond the former 180-day/120-activity bounds and
  uses planning-timezone day boundaries.

## Verification

```text
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm --filter @repo/api test:live-db
pnpm --filter @repo/db db:verify
pnpm quality:agent:db
```
