# Activity-derived performance calibration implementation

## Status and delivery boundary

This is the accepted implementation specification for automatic, activity-derived
performance calibrations. It is scoped to the active `dev` checkout. It authorizes
local implementation, database migration, and verification only; it does not
authorize a commit, push, release, deployment, database reset, or provider-account
mutation.

The corrected architecture in this document supersedes the earlier design that
stored provisional/confirmed/stale state on calibration history rows or in a
parallel estimate column. Lifecycle state is stored only in the published target
fact.

Do not modify unrelated dirty work in the checkout. Preserve existing activity,
import, athlete-state, and read-model behavior unless this specification explicitly
changes it.

## Outcome

Users receive useful, sport-specific dynamic targets as activity data arrives or is
imported. A first high-quality observation can provide a **provisional** target
immediately. Independent activity evidence automatically confirms, changes, or
invalidates that target. The system never treats an arbitrary easy activity, a
provider summary, an activity label, or a manually entered value as calibration
authority.

The product promise is:

> Use the best available activity-derived calibration immediately, expose its
> confidence, and tighten or change targets only as independent qualifying evidence
> supports it.

This is a training-zone calibration policy, not a lab diagnosis of physiological
lactate threshold.

## Product decisions

1. Calibration identity is the pair `{ metricKey, activityCategory }`.
2. Initial metric keys are `threshold_power`, `threshold_speed`, and
   `threshold_heart_rate`.
3. Initial categories are `bike`, `run`, and `swim`; each combination is enabled
   only when it has an explicit policy and target consumer.
4. Store threshold pace canonically as `threshold_speed` in meters per second.
   Convert to min/km, min/mi, sec/100 m, or sec/100 yd only at the presentation
   boundary.
5. All profiles default to automatic selection. There is no manual, coach, test
   label, provider-summary, or user-entered priority source in this slice.
6. A structured-test label may be retained as context but cannot bypass stream
   quality or metric-specific qualification.
7. Activity evidence is immutable except for explicit invalidation when its source
   artifact/revision ceases to be accepted. Source correction, rejection, and hard
   activity deletion retain the invalidated calibration evidence audit row.
8. A calibration is historical and effective-dated. Current profile state is a
   rebuildable projection, never the authority. Historical reanalysis is
   **current-source as-of**: it is reproducible for the same accepted source
   revisions, but a later source correction may invalidate and correct a prior
   derived result. The completed activity's originally resolved target snapshot is
   retained separately for audit.
9. New target values apply to future plans and recording snapshots. They do not
   rewrite already-completed activity analysis unless a separate reanalysis feature
   is explicitly introduced.
10. When evidence is inadequate, the system abstains. Plans use RPE/duration or an
    otherwise available compatible target rather than inventing a threshold.

## Metric registry

Implement a Zod-first, framework-free registry in `packages/core`. The registry is
the source of truth for the identity, unit, allowed categories, policy version,
expiry, target consumer, and calculation entrypoint. Do not store configurable
calculation rules in database JSON.

```ts
type CalibrationMetricKey =
  | "threshold_power"
  | "threshold_speed"
  | "threshold_heart_rate";

type CalibrationState = "provisional" | "confirmed" | "stale" | "unavailable";

type CalibrationIdentity = {
  metricKey: CalibrationMetricKey;
  activityCategory: "bike" | "run" | "swim";
};
```

Initial enabled registry entries:

| Identity | Canonical unit | Product label | Initial target consumer |
| --- | --- | --- | --- |
| `threshold_power/bike` | watts | FTP / Bike Threshold Power | power zones, bike power common load, bike plan targets |
| `threshold_speed/run` | meters/second | Run Threshold Pace | run pace zones and plan targets |
| `threshold_speed/swim` | meters/second | CSS | swim pace targets and load |
| `threshold_heart_rate/bike` | beats/minute | Bike LTHR | bike HR zones and HR-load fallback |
| `threshold_heart_rate/run` | beats/minute | Run LTHR | run HR zones and HR-load fallback |

`threshold_power/run`, `threshold_power/swim`, and `threshold_heart_rate/swim`
may be stored as evidence only after a policy is implemented and validated. They
must not produce active target facts merely because the schema admits their units.

## Evidence and calibration schema

Keep `profile_metrics` for direct observations such as weight, sleep, HRV,
resting HR, and wellness. Do not use it for calibration candidates or active
calibrations.

### `performance_calibration_evidence`

Add a table that records one policy evaluation for one accepted activity/segment
revision and calibration identity.

```text
id                    UUID primary key
profile_id            UUID not null -> profiles.id
metric_key            performance_calibration_metric_key not null
activity_category     canonical activity category not null
value                 NUMERIC nullable
unit                  TEXT not null
observed_at           TIMESTAMPTZ not null

activity_id           UUID not null (retained source identity)
segment_id            UUID not null (retained source identity)
segment_revision      BIGINT not null
source_artifact_id    UUID not null -> activity source artifact identity

state                 candidate | rejected | invalidated
rejection_reason      closed nullable reason enum
policy_version        TEXT not null
source_semantics      measured | derived
diagnostics           JSONB not null

created_at            TIMESTAMPTZ not null
invalidated_at        TIMESTAMPTZ nullable
invalidation_reason   TEXT nullable
```

Required constraints and indexes:

```text
value is non-null for candidate and invalidated candidate evidence; rejected
  evidence has null value
unit is the registry canonical unit for metric_key
invalidated_at is non-null iff state = invalidated
unique(activity_id, segment_id, segment_revision, metric_key, policy_version)
index(profile_id, metric_key, activity_category, observed_at desc)
  where state = candidate and invalidated_at is null
index(activity_id, segment_id, segment_revision)
```

Validate composite ownership/source identity before inserting evidence:

```text
(activity_id, profile_id) resolves to the profile-owned activity identity
(segment_id, activity_id, profile_id) resolves to the profile-owned segment identity
(activity_id, source_artifact_id, profile_id) resolves to the activity's owner-matched
  accepted artifact/source-link identity at evaluation time
```

Follow the existing accepted-source ownership pattern and reject cross-profile or
wrong-activity evidence before insertion. The source identity columns intentionally
do not retain parent foreign keys: corrected segments, source links, artifacts, and
hard-deleted activities may disappear only after their candidate evidence has been
invalidated and affected identities re-resolved in the same transaction. The
invalidated audit row remains profile-owned and queryable.

Use explicit application validation plus database checks for enum/state/nullability
invariants. The database cannot safely validate arbitrary registry-unit matching;
enforce that mapping in Core and add targeted live-DB constraint tests for structural
invariants.

`diagnostics` is a versioned object. It retains inputs needed to explain and audit a
decision: stream coverage, maximum gap, selected window, output variability,
supporting threshold identity/value, and policy-specific reason. Do not place query
predicates only in diagnostics.

### `performance_calibrations`

Add an effective-dated, immutable selection table.

```text
id                    UUID primary key
profile_id            UUID not null -> profiles.id
metric_key            performance_calibration_metric_key not null
activity_category     canonical activity category not null
value                 NUMERIC not null
unit                  TEXT not null

effective_at          TIMESTAMPTZ not null
expires_at            TIMESTAMPTZ not null
policy_version        TEXT not null
selection_diagnostics JSONB not null
supersedes_id         UUID nullable -> performance_calibrations.id
created_at            TIMESTAMPTZ not null
```

`selection_diagnostics` contains selected evidence IDs, evidence count, selection
reason, trend, tolerances, and policy version. It is an audit projection, not an
unvalidated input.

Selection history does not store provisional/confirmed/stale. Core derives that
state while building the target fact: a first-evidence selection is provisional,
policy-confirmed selections are confirmed, and any selected row at or beyond
`expires_at` is stale. The resulting state is persisted only in the published
`target_fact`.

### Normalized selection/evidence links

Retain the two calibration entities above and add only the small association
`performance_calibration_selection_evidence` between them. It contains
`{ calibration_id, evidence_id, profile_id, metric_key, activity_category, ordinal }`,
identity-matched composite foreign keys to both owners, a unique calibration ordinal,
and an evidence-leading index. The JSON evidence IDs remain immutable audit data, but
current-source reads must validate them against these normalized links. Source
invalidation and dependent selection discovery must not depend on JSON predicates.

Required indexes:

```text
index(profile_id, metric_key, activity_category, effective_at desc)
index(profile_id, expires_at)
```

Do not enforce a single current row with a mutable flag. The resolver selects the
latest eligible effective-dated row as of a supplied instant. This preserves
historical reproducibility and makes replacement append-only.

### `profile_performance_estimates`

This existing table remains the current, fast read model. It also stores
non-calibration capabilities such as `longest_distance` and `longest_duration`, so
do **not** globally rename `capability_kind` to `metric_key` or constrain every row
to calibration identities. Keep `capability_kind` as the general projection key.
For calibration estimates, write the generic values `threshold_power`,
`threshold_speed`, and `threshold_heart_rate` and retain `activity_category` as the
category dimension. Legacy flattened calibration keys (`bike_ftp`,
`run_threshold_pace`, `swim_css`, and `*_lthr`) must be removed from calibration
projection only after their consumers map the new pair correctly.

The typed `target_fact` is the sole persisted lifecycle authority:

```text
calibration_state     provisional | confirmed | stale
```

Do not add a parallel `calibration_state` column or another lifecycle field. Plans
need an explicit behavioral state in `target_fact`. Preserve `target_fact` as the
typed, consumer-facing fact with
value, unit, state, confidence, effective/expiry times, policy version, evidence
count, trend, and selected calibration ID/version.

## Core contracts and calculations

### Common lifecycle, metric-specific policy

Core owns a shared evidence lifecycle contract and explicit policy functions per
metric. Do not create a universal JSON-configured threshold algorithm.

```ts
evaluateCalibrationEvidence(input):
  | { state: "candidate"; value; diagnostics }
  | { state: "rejected"; reason; diagnostics };

selectCalibration(input):
  | { state: "provisional" | "confirmed" | "stale"; calibration }
  | { state: "unavailable"; reason };
```

The selection input is bounded, deterministic, sorted, and supplied with an
explicit `asOf`. Core must not read the clock or database.

The selection result state is transient projection output. `CalibrationRecord`
does not contain a persisted lifecycle state.

### Initial policies

#### Bike threshold power

Keep the current activity-derived duration/performance model as the candidate
extractor. Publish a provisional target as soon as that model yields eligible
evidence and model quality. Confirm/increase/decrease according to its own
multi-duration evidence policy; do not replace it with a single-ride average.

#### Bike and run threshold heart rate

Create a candidate only from a continuous 30-minute active window with:

```text
HR coverage >= 95%
supporting output coverage >= 95%
no HR or output gap/pause > 5 seconds
output coefficient of variation <= 10%
supporting output is threshold-like for that sport
candidate value = time-weighted HR over final 20 minutes
```

Bike supporting output is a valid bike threshold-power target. Run supporting
output is a qualifying threshold-speed target. A workout label is not evidence.

One candidate publishes a provisional calibration. Two candidates from separate
calendar days, 7-42 days apart, and within 3 bpm confirm it. Change an existing
value only with three qualifying candidates on 14-56 days, mutually within 3 bpm,
whose median differs by at least 4 bpm. Use the median; never select maximum HR.

#### Run threshold speed

Create evidence from a continuous 30-minute run window with valid pace and grade
coverage, no meaningful stop/gap, stable grade-adjusted speed, and a
threshold-like athlete-relative effort. One candidate is provisional; use the
power/speed confirmation policy below.

For the initial policy, the candidate is the exact-window time-weighted
grade-adjusted speed. The same activity's 20-minute best grade-adjusted speed is
the athlete-relative comparator: the 30-minute value must be at least 90% and no
more than 100.1% of it. This makes one qualifying activity independently useful
without consulting an aggregate running-duration model.

#### Swim threshold speed

Use the existing complete 400 m then 200 m CSS protocol evidence. A complete
accepted protocol can publish a confirmed `threshold_speed/swim` calibration
immediately. Arbitrary swim pace, wrist HR, and provider estimates do not qualify.

### Power/speed selection policy

For threshold power and threshold speed, select the highest **supported sustainable
performance band**, not the highest raw datapoint.

```text
increase: two qualifying separate-day candidates, 7-42 days apart,
          mutually within 3%, median >= 3% above current

decrease: three qualifying candidates, 14-56 days apart,
          mutually within 3%, median >= 3% below current,
          and no equally qualified recent evidence supports the current band
```

This uses stricter evidence for a decrease, so easy/base sessions, fatigue, illness,
or poor pacing do not lower targets. If comparable qualifying evidence is absent,
the calibration becomes stale after its metric-specific expiry; it does not infer a
decrease.

### Freshness

Initial expiry policy:

```text
threshold_power:       90 days
threshold_speed/run:   90 days
threshold_speed/swim:  90 days
threshold_heart_rate:  90 days
```

Expiry must be scheduled as a state invalidation/rebuild event. Do not wait for the
next user activity to mark a target stale. Add a bounded due-calibration sweep to
the existing server-owned athlete-intelligence worker schedule; do not create one
durable job per athlete. The sweep claims due current calibrations with
`FOR UPDATE SKIP LOCKED`, rechecks that each is still current and due in its
transaction, and calls `markAthleteStateDirty`
with `effectiveAt = expires_at`. It must be idempotent, retry-safe, and use the same
per-profile advisory lock/fence as activity reconciliation. It does not append a
stale history row. A due item is complete when the matching published target fact
contains `calibrationState = stale`.

## Ingestion, import, and invalidation

Extend the accepted activity-file evidence reconciliation flow, not routers or
provider adapters independently.

1. Reconcile activity, segments, streams, and efforts as today.
2. Evaluate every registry-supported metric/category applicable to the accepted
   segment revision.
3. Upsert the corresponding evidence evaluation idempotently.
4. Resolve only the affected calibration identities as of the activity finish time.
5. Append calibration rows when a new effective value/expiry/audit selection is
   made, including first selection, confirmation, replacement, or supported refresh.
   Do not append a row solely for staleness.
6. In the same transaction, call `markAthleteStateDirty` when a current target
   changes. The dirty instant is the calibration's `effective_at`.

For onboarding/history import, preserve the import fence and process evidence in
chronological source time. A post-batch rebuild may yield immediately confirmed
targets when historical import contains sufficient independent evidence. Do not
publish athlete state as fresh while the bulk import remains active.

If a source artifact changes, a segment revision is superseded, or an activity is
rejected:

1. mark affected evidence invalidated in the same reconciliation/deletion
   transaction;
2. re-resolve calibrations that cite it;
3. mark athlete state dirty if the current projection changes.

If an activity is hard-deleted, capture its affected calibration identities first,
invalidate its candidate evidence, re-resolve those identities, and mark athlete
state dirty before deleting the activity/source parents. Retain the invalidated
evidence audit rows. Calibration evidence insertion and deletion both take the
same per-profile advisory transaction lock. After artifact retention completes,
the final locked activity-deletion transaction invalidates candidates again,
deletes the activity, and re-resolves the union of preflight and final identities;
therefore a candidate created during the external-retention interval cannot survive
against a deleted activity.

Never use provider-reported FTP, LTHR, zones, fitness, training load, or CSS as
authoritative evidence. Retain provider raw streams, timing, and artifact
provenance only.

## Performance-model and profile-state integration

`getAthletePerformanceModelAsOf` remains the sole as-of authority. Replace its
legacy `profile_metrics` LTHR query with a repository method that resolves
calibrations by `{ profileId, metricKey, activityCategory, asOf }` and verifies
their cited evidence is still accepted/current. This is **current-source as-of**
resolution, not immutable transaction-time reconstruction: a later accepted source
correction invalidates dependent evidence and can correct a subsequent reanalysis.
The originally used target snapshot remains attached to completed analysis/recording
for audit.

The model projects generic calibration identities into existing target facts:

```text
threshold_power/bike       -> cycling.planningThresholdPower
threshold_speed/run        -> running.planningThresholdPace
threshold_speed/swim       -> swimming.css
threshold_heart_rate/bike  -> heartRate.bike.lthr
threshold_heart_rate/run   -> heartRate.run.lthr
```

`profile_athlete_state` is the revision/freshness coordinator. It does not store
threshold values. `profile_performance_estimates` is the current target projection.
Neither stores a parallel calibration lifecycle field outside `target_fact`.

### Atomic rebuild and publication

Keep the existing claim/fence model in:

```text
packages/api/src/application/athlete-intelligence/athlete-state-worker.ts
packages/api/src/repositories/athlete-state-repository.ts
```

The worker must:

1. claim one profile and `source_revision`;
2. build performance facts with `getAthletePerformanceModelAsOf({ asOf: now })`;
3. create estimates carrying the generic metric key, category, and typed target fact
   (including its sole calibration lifecycle state);
4. publish in the existing single database transaction:
   - acquire the profile advisory transaction lock;
   - verify the claim fence with `source_revision`, lease token, and import fence;
   - replace the profile's complete `profile_performance_estimates` projection;
   - set `published_revision = claim.source_revision` and clear the lease;
   - enqueue any provider-visible desired-state refresh only after the fenced state
     update, in the same transaction, so publication and durable outbound jobs become
     visible atomically;
   - commit.

The published-read query must continue filtering estimates by:

```text
estimate.source_revision = profile_athlete_state.published_revision
```

Consequently, readers observe either the previous complete projection or the new
complete projection. If an activity/calibration write increments `source_revision`
during a rebuild, the publish fence fails and rolls the transaction back. A later
claim rebuilds from the new revision.

No activity reconciliation path may enqueue provider/device target changes from the
unpublished calibration model. If a provider has no target-sync implementation, the
worker retains only this post-publication seam and performs no provider mutation.

Extend the current future-evidence check in `publishAthleteState` to include future
effective calibration changes and due calibration expiry, so a future-dated imported
calibration or future expiry keeps the state dirty after a current-time publication.

## Plan, recording, and UI behavior

Plans and recording consume only published athlete performance target facts. They
must never query calibration evidence directly.

| Calibration state | Dynamic target behavior |
| --- | --- |
| `confirmed` | precise sport-appropriate zones/ranges |
| `provisional` | broader target range plus RPE guidance |
| `stale` | conservative range or RPE fallback |
| `unavailable` | no invented threshold target; use RPE/duration or compatible available metric |

Future plans resolve the current published target snapshot when displayed, refreshed,
or started. A recording captures a target snapshot at session start. Completed
activities retain the target identity/value/version used for their analysis.

Every newly completed server activity stores an immutable
`performance_target_snapshot` envelope containing capture time, published revision
and freshness, and the complete typed target facts (identity by target slot,
calibration ID, value, unit, calculation/policy version, and lifecycle state). Source
correction may change current-source calibration history, but completed analysis and
training load use this stored snapshot rather than re-resolving current calibration.
Legacy rows may remain null; enrichment/source correction never overwrites a captured
snapshot.

Expose a read-only calibration status DTO when UI work is in scope. It must contain
the active value, unit, state, effective/expiry time, trend, evidence count, and
safe explanation. It must not expose raw activity streams or persistence rows.

No manual calibration mutation endpoint is part of this implementation.

## Migration and compatibility

1. Add the two calibration entity tables, their normalized evidence association,
   required enums/checks/indexes, and Drizzle schema/validation/types in one
   fresh-baseline-compatible migration.
2. Add the completed-activity target snapshot. Store lifecycle only inside the
   existing published `target_fact`; do not add a parallel estimate/history state.
3. Do not promote legacy `profile_metrics` rows produced by
   `activity_file_lthr_detection` into the new policy. They remain historical
   records but are ineligible for the new calibration resolver.
4. Do not backfill synthetic candidates from summary/provider data.
5. New evidence is generated through new imports, new activities, and explicit
   accepted-artifact reconciliation. A deliberate historical raw-artifact replay
   may be added later only with a defined target/database authority.
6. Remove legacy LTHR selection only after the new resolver and current-target
   projection are live together. No dual authority or fallback selection is allowed.

## Implementation order

1. Read the nearest instructions and tests for Core, DB, API, athlete-state worker,
   and activity evidence reconciliation. Start from the relevant exemplars in
   `docs/agent-exemplars.md`.
2. Add Core schemas, registry, deterministic selection contracts, and unit tests.
3. Add database schema, migration, validation/types, structural constraints, and
   live-DB tests.
4. Add calibration repositories with ownership, current accepted-revision checks,
   bounded as-of reads, idempotent evidence writes, and invalidation operations.
5. Extend activity reconciliation to produce evidence and recalibrate transactionally.
6. Replace performance-model legacy LTHR reads; project generic identities into
   existing performance-target facts.
7. Extend athlete-state estimate projection and atomic publication.
8. Update plan/recording target interpretation for provisional/confirmed/stale.
9. Add read-only API/UI status only after the server contract is stable.
10. Remove legacy selection code and add regression coverage before broad validation.

## Required verification

### Core

- candidate/rejection boundary tests for each enabled metric;
- deterministic tie-breaking, temporal boundaries, unit/range, confirmation,
  increase, decrease, stale, and invalidation tests;
- property/boundary tests for no easy effort lowering a power/speed calibration and
  no maximum-HR selection for threshold HR;
- `pnpm --filter @repo/core check-types` and focused Core tests.

### Database and repository

- migration/schema validation with `pnpm --filter @repo/db db:verify`;
- live-DB proof for ownership, source revision identity, idempotent evidence write,
  invalidation, as-of visibility, indexes/representative plan, and constraints;
- prove no legacy LTHR row resolves through the new selector.

### API and state publication

- activity submission and bulk-import tests for provisional and immediately
  confirmed outcomes;
- performance-model as-of tests before/after `effective_at` and self-exclusion;
- state-worker tests proving target facts are projected with calibration state;
- transaction/concurrency test: increment source revision after claim and prove the
  stale worker cannot publish estimates;
- snapshot test: estimates are visible only for `published_revision`;
- expiry-trigger test marks state dirty and publishes stale/unavailable state.

### Consumer behavior

- plan target tests for confirmed/provisional/stale/unavailable facts;
- recording-start test proves target snapshot stability;
- completed-activity regression proves a later calibration does not rewrite the
  previous activity's as-of target;
- focused API typecheck/tests, then `pnpm quality:agent` for integration.

## Acceptance criteria

1. A newly submitted or historically imported accepted activity can automatically
   create a provisional calibration when its metric policy qualifies.
2. Independent qualifying activity evidence automatically confirms, increases, or
   decreases a calibration according to the exact metric policy.
3. Easy, partial, interval, provider-summary, label-only, and incompatible-source
   evidence cannot alter active calibrations.
4. Plans and recording obtain dynamic targets from one published profile snapshot
   and react appropriately to calibration state.
5. Historical analysis is reproducible against the same accepted source revisions;
   later accepted source corrections invalidate dependent calibrations while stored
   completed-session target snapshots remain auditable.
6. Activity/source revision changes invalidate dependent evidence and cannot leave a
   stale calibration current.
7. `profile_athlete_state` and `profile_performance_estimates` publish matching
   revisions atomically, including under a concurrent source update.
8. No manual-priority or legacy-LTHR fallback path remains in automatic target
   resolution.
