# Product simplification program

## Purpose

Reduce GradientPeak to a small set of authoritative product primitives while
preserving supported athlete, planning, scheduling, activity, and Wahoo flows.
This is a hard cut: do not retain legacy endpoints, compatibility DTOs, dual
writes, fallback readers, old schema variants, or transition-only UI.

The database target is fresh-only. A populated target requires an explicitly
approved reset, export, or separate migration program; do not add compatibility
columns or readers to carry old data forward.

## Accepted product model

```text
Athlete Snapshot
  Published observed state, current performance estimates, freshness, and targets.

Activity Plan
  Reusable workout definition.

Training Plan
  Reusable template or batch that creates Calendar Scheduled Sessions.

Calendar Scheduled Session
  The sole authoritative future schedule.

Goal
  A first-class dated planning target that appears in calendar read projections;
  it is not encoded as a synthetic scheduled session.

Completed Activity Evidence
  Canonical completed activity, segments, artifact/source provenance, and derived
  effort evidence.
```

There is no second live schedule in `training_plans.structure`. Calendar sessions
own all future session editing, cancellation, reassignment, and completion links.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `@repo/core` | Canonical domain schemas, pure calculations, plan-template/content definitions, validation, compilers, date/timezone rules, deterministic fixtures. |
| `packages/api` | Transport DTOs, authorization, orchestration, transactions, background work, read models. |
| `packages/db` | Relational constraints, active fresh baseline, indexes, RLS/ACLs, and Core-driven seed projection. |
| Apps | Presentation, navigation, form state, local schedule linting, server-query lifecycle. |

Core owns canonical system-template and curated-content definitions. Database
seeding is a validated materialization of those definitions, never an independent
SQL/template corpus. User-created activity plans remain database-owned.

## Invariants

- The published Athlete Snapshot is the sole ordinary read authority for current
  fitness, fatigue, form, readiness, targets, and planning baseline.
- Providers supply raw activity evidence only. Wahoo is the only operational
  provider today. Provider-neutral domain and persistence contracts remain the
  extension boundary; do not add a generic runtime adapter registry, partial
  provider enablement, or unsupported provider UI.
- A private transactional evaluator may use raw evidence during ingestion or an
  immediate provider effect. Presentation, planning, recording defaults, home, and
  trends never use it as a second current-state read model.
- A Calendar Scheduled Session is assigned by an athlete planning-calendar date.
  Device timezone is presentation-only for personal scheduling.
- Group events retain their separate authorization and RSVP model. They are only
  merged into calendar display projections.
- Activity efforts are immutable, activity-and-segment-backed derived evidence.
- Planned scenarios are pure calculations. They never alter published observed
  athlete state.

## Phase 0: correctness gates

Complete these before structural deletion.

1. Use `publishedRevision` as the only plan preview/save fence. Delete
   `basePerformanceRevision`, `publishedPerformanceRevision`, related mocks, and
   receipt assertions.
2. A later successful import must supersede covered failed import runs so published
   state can become fresh. Test failed onboarding followed by successful
   manual/history sync.
3. Remove the parallel persisted `performance_model` JSON/revision authority.
   Published state revision plus `profile_performance_estimates` is the only
   persisted current-performance authority.
4. Use one artifact-ingestion finalizer for provider, manual, and enrichment paths:
   parse, promote, submit canonical activity, then cleanup or quarantine. Failed
   parsing/persistence must not leave undiscoverable canonical bytes.
5. Use recurrence `occurrenceKey` as every materialized personal occurrence's
   `scheduled_date`; never derive a planning date by slicing a UTC instant.
6. Preserve every supported content visibility value, including `followers`,
   through app hydration, edit state, and persistence.
7. Define daily common-load aggregation bounds that permit several valid sessions
   on one day without rejecting the aggregate.

## Phase 1: athlete read model

Create one API-owned, revisioned `AthleteReadModel` with bounded optional sections:

```text
published state and estimates
freshness, rebuild, and import status
current baseline
bounded load history keyed by published revision and algorithm version
profile observation timeline
activity analytics summaries
```

Move home, trends, goals, planning creation, plan validation, profile performance,
and recording defaults to this model.

Delete:

- `commonLoadHistory` as a separate current-state authority;
- raw athlete-performance presentation procedures;
- legacy raw planning creation/insight/current-status/curve/weekly-summary paths;
- duplicate home/trends load and readiness calculations;
- public general-purpose performance-model reads.

Retain the raw evidence evaluator only as an internal transactional dependency for
ingestion and immediate Wahoo effects. Its date semantics must agree with the
published worker's event-time and planning-day rules.

`profile_metrics` becomes an observation/configuration log only. Derived current
thresholds, calibrations, and target facts live in
`profile_performance_estimates`; historical analysis uses raw activity evidence
when it genuinely needs an as-of evaluation.

## Phase 2: calendar-authoritative scheduling

### Training plans

Training plans are reusable schedule templates/batches. Applying one creates
Calendar Scheduled Sessions. A plan is not a second editable live schedule.

Replace separate create, update, duplicate, and receipt-bound save workflows with:

```text
trainingPlans.preview({ kind, draft })
trainingPlans.commit({ kind, draft, basePublishedRevision })
```

`commit` recalculates under the existing authorization, profile advisory fence,
structure/revision compare-and-set, linked-plan locks, and transaction boundary. A
preview is UI feedback only; it is never trusted as authority to persist.

The detail read includes the exact editor requirements: structure hash/revision,
validation state, and schedule/template metadata. Delete `getPlanView`, receipt
transport, client-generated create identifiers, and duplicate client preview/save
orchestration.

### Calendar sessions

Calendar sessions own future-session mutation and completion behavior. Use:

```text
calendar.range({ startDate, endDateExclusive })
calendar.day({ date })
events.getById({ id })
```

Personal schedule APIs accept date keys only. Timed/group-event reads use explicit
instants and IANA zones. Group events own an organizer/event timezone; editing an
event must render and resolve wall time in that zone, not in the editor's device
zone.

Calendar projections expose first-class typed items. A scheduled session includes
its activity-plan/workout summary and completion state; goals appear as dated goal
items; completed activities and authorized group-event summaries remain distinct
item types. Calendar display composition does not make those independent resources
share one persistence table.

Retain bounded recurring-series creation, single-occurrence edit, single-occurrence
cancel, and series cancel. Remove recurrence-rule editing and group-series edit
until a complete reconciliation model exists.

Collapse Scheduled Activities browse/detail routes into a filtered Calendar agenda
mode. Do not preserve redirects or compatibility routes after callers move.

## Phase 3: activity-plan and system content

### Activity-plan structure

- Move `activity_category` to the root structure; delete repeated segment category
  fields, UI propagation, mixed-category checks, and repeated JSON filtering.
- Require one `ownerScope`; delete boolean list flags and unused sort direction.
- Return only `prescriptionQuantification`; delete duplicate duration, load,
  confidence, and warning aliases after all consumers derive from that bundle.
- Remove inactive/periodized/maintenance/wizard/minimal-plan schema families and
  transport wrappers that are not active persisted canonical structure.
- Delete unused daily-adjustment and old preview adapters rather than maintaining
  compatibility exports.

### System templates and curated content

Core exposes versioned definitions with stable keys and deterministic content hashes.
Core tests must prove schema validity, compilation, quantification, uniqueness,
reference integrity, category, duration/load bounds, and deterministic output.

The Core-driven seed workflow materializes the catalogue into the database with its
Core key, version, and content hash. Add parity tests that prove the seeded catalogue
matches Core exactly. API queries the database for availability, ownership, and
transactional linking, but does not reimplement template classification or keep a
second runtime corpus. Do not hand-author system template content in SQL.

## Phase 4: completed activity evidence

### Ingestion and artifacts

All provider, manual, mobile-recording, and enrichment inputs converge through the
same canonical activity submission and artifact finalizer. Delete duplicate manual
and enrichment promotion orchestrators.

Remove manual activity-category selection and redundant provenance transport; derive
category solely from parsed evidence. Unknown input remains explicitly unknown, not a
UI-selected default.

Once recovery reads use `artifact_id`, remove accepted artifact digest, path, size,
format, bucket, and media-type duplicates from ingestion records. Keep staging
expectations and cleanup state because they are recovery authority.

### Activity efforts and analysis

Make efforts immutable derived evidence with non-null activity, segment, provenance,
source, method, and calculation version. Delete effort create/update/delete
contracts, rejected mutation procedures, standalone/manual effort semantics, and the
new-effort route. Provide effort history through activity-derived views.

Remove parent activity fields that duplicate single-segment summaries, including
normalized graded speed, efficiency factor, and aerobic decoupling, after remaining
readers derive them from the canonical segment summary. Preserve explicit null
semantics for multisport activity.

`activity_source_references` is the only provider activity identity. Remove legacy
activity provider/external-id fields and generic activity resource links after source
reference callers are complete.

## Phase 5: plan tab, calendar UI, and analytics

### Plan tab

Replace the mobile snapshot/dashboard stack with one purpose-built Plan-tab server
DTO containing current scheduled-plan identity, bounded timeline days/weeks,
recommendation points, source coverage, and goal markers. Build it from one
consistent read snapshot.

Delete dual recent/upcoming 500-row event streams, duplicated client merging,
snapshot fallback history, redundant active-plan reads, local reaggregation, and
unused dashboard/view-model adapters. Load published state and activity-plan picker
data only when editing needs them.

### Calendar UI

Move calendar range/day aggregation server-side. A calendar projection combines
authorized personal sessions, completed activities, goals, planned-load summaries,
and selected group-event summaries. It does not merge group-event persistence or
authorization into personal events.

Use one Core calendar-date module with explicit schedule date, local wall-time, and
IANA-zone conversion functions. Delete device-midnight schedule-query conversion,
overloaded date/datetime router parsing, and app-specific timezone arithmetic.

### Trends and performance

Web and mobile trends consume `AthleteReadModel`, rather than independently joining
metrics, dashboard, load history, and peak-performance queries. Keep platform-native
rendering but delete app-local source joining and duplicated insight heuristics.

## Phase 6: supporting product hard cuts

- Use Wahoo sync overview/setup data for onboarding. Delete onboarding's duplicate
  enrichment lifecycle, polling state, start/status APIs, and `integrations.list`
  once onboarding callers move.
- Make executable provider contracts Wahoo-only. Keep neutral durable provider
  identity/import concepts where they protect source resolution and recovery.
- Remove `request_to_join` policy and old join/request procedures only after a data
  decision confirms member-list visibility will not be broadened unexpectedly.
- Remove public user-route visibility if row inventory confirms no supported public
  user routes. Keep public system route templates.
- Remove `profile_goals.revision`; it provides no actual optimistic concurrency.
- Delete dead Core calculators, curve/test detectors, aliases, Garmin export code,
  unused provider-readiness DTOs, obsolete barrels, and their compatibility tests.

## Database hard cuts

Update Drizzle schema and the active fresh baseline together through declared DB
workflows. Do not edit immutable archives or introduce migration shims.

Remove only after their active callers are removed:

```text
parallel performance-model JSON/revision fields
legacy activity identity columns and links
duplicated accepted-artifact columns
duplicate parent numerical-analysis columns
standalone/null effort relationship states
dead event payload/read-only/lifecycle/exception fields
obsolete activity-plan and training-plan transport-only fields
unused goals revision
```

Retain database canonical structure validation, tenant ownership predicates, source
reference uniqueness, queue leases/generation/receipts, import fences, and published
state atomicity. They are durable correctness boundaries, not duplicate business
logic.

## Required implementation order

```text
Phase 0 correctness
  -> AthleteReadModel
  -> calendar-authoritative session model
  -> training-plan preview/commit and template/batch conversion
  -> activity-plan/content convergence
  -> unified ingestion and derived-effort cut
  -> Plan-tab/calendar/trends read projections
  -> supporting product hard cuts
  -> schema/API/UI/test/export deletion
```

Each phase removes old callers before deleting their contract. Do not retain aliases,
fallbacks, dual writes, legacy DTOs, or compatibility readers.

## Completion evidence

Before integration or local user testing, prove:

1. Published current state equals dashboard, planning, goal, and recording baseline
   for fresh, stale, unavailable, active-import, and failed-import cases.
2. Plan preview and commit agree for create, update, duplicate, stale state, linked
   activity-plan availability, and concurrent writes.
3. Calendar scheduling remains correct across UTC-12 through UTC+14, DST gaps/folds,
   athlete travel, organizer timezone, recurrence bounds, cancellation, and
   completion linking.
4. Ingestion is safe for parse failure, promotion failure, same-digest concurrency,
   lease loss, cleanup retry, and provider redelivery.
5. System template seed output exactly matches Core validated content.
6. Source identity, athlete-state publication, authorization, and tenant predicates
   pass live-database tests.
7. Web/mobile cover activity import, activity detail, plan creation/application/edit,
   calendar day/range, Wahoo sync, and post-completion activity flows.
8. Run DB fresh-baseline/fingerprint verification, package checks, and
   `pnpm quality:agent` on supported Node 24.
