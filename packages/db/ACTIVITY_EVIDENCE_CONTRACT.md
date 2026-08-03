# Profile metrics and activity efforts

This document defines how GradientPeak uses `profile_metrics` and `activity_efforts`. The Drizzle schema remains the relational source of truth; this document owns the semantic decision rules that cannot be inferred from columns alone.

## Choose the table by meaning

| Question | `profile_metrics` | `activity_efforts` |
| --- | --- | --- |
| What does a row mean? | A point-in-time observation about an athlete | A maximum sustainable power or speed over a duration |
| Typical examples | weight, resting HR, activity-derived LTHR, HRV | bike power curve points, run/swim speed curve points, qualified test efforts |
| Required time | When the metric was observed | When the effort occurred |
| Optional activity link | `reference_activity_id` records evidence origin | Imported observations require matching activity and segment identity |
| Canonical units | The unit declared for the metric type | `watts` for bike power; `meters_per_second` for run/swim speed |
| Not appropriate for | Duration/value curve points | General wellness or one-value biometrics |

Prescriptive performance targets are projections of canonical models over eligible activity evidence. A profile metric or provider summary never becomes a cycling, running, or swimming target by being relabeled or expanded into synthetic curve points.

`swimming_css_protocol_evidence` is a separate qualified protocol projection. One row retains the
canonical pool `css_400m_200m` identity, current accepted source artifact content identity, accepted
segment revision, and the distinct observed 400 m then 200 m effort identities and complete timing.
It never stores CSS pace or speed. Core calculates CSS from an eligible protocol at the requested
as-of instant; profile metrics and standalone/manual effort rows have no CSS authority.

## Evidence contract

Every consumer must preserve these dimensions:

- **Ownership:** `profile_id` is the athlete whose evidence is represented. A linked activity must have the same owner. Authentication alone is not an ownership check.
- **Observation time:** `recorded_at` is domain evidence time. `created_at` and `updated_at` are transaction metadata and must never renew freshness.
- **As-of time:** calculations use only evidence with `recorded_at <= asOf`. Pass `asOf` explicitly; do not read the clock inside a deterministic calculation.
- **Accepted artifact:** imported effort evidence is eligible only when its segment belongs to the parent activity's accepted segment revision and the segment's source artifact is that activity's current, accepted, owner-matched source link.
- **CSS protocol identity:** qualified CSS evidence requires one activity-scoped protocol identity, one pool length and pool-length timing basis, exact complete 400 m then 200 m source segments, matching source-effort observation IDs, and one accepted evidence revision. A source artifact switch or segment revision change makes the old protocol ineligible until reconciliation replaces it.
- **Units:** new database and API writes use canonical metric units. Presentation preference is an app-boundary concern. Core's central evidence adapter temporarily accepts documented legacy aliases for existing rows; feature code must not add new alias branches.
- **Provenance:** `source`, `method`, `calculation_version`, and `provenance` travel together through repository, DTO, and Core snapshot boundaries. Dropping them changes trust semantics.
- **Quality:** absence of a quality score means unknown, not perfect quality. Eligibility policy belongs in Core and may use provenance even when quality is unknown.
- **Reproducibility:** generated evidence names its calculation version and source identity. Equal values are not sufficient for deduplication; use a durable operation or source identity.

## Write policy

1. Parse input through the owning Core schema and normalize to canonical units.
2. Authorize `profile_id` and every referenced resource in the persistence predicate or transaction.
3. Assign one documented source/method/provenance combination.
4. Use one transaction for evidence created by one operation, such as activity-file reconciliation.
5. Make replay behavior explicit with a source identity, operation ID, or uniqueness constraint.
6. Prefer immutable observations. Corrections to generated/provider evidence create a manual override. Any in-place edit or hard delete of manual evidence is compatibility behavior until the evidence-lifecycle decision is completed; do not copy it into new writers.

Canonical writers include:

- profile metric CRUD in `packages/api/src/routers/profile-metrics.ts`;
- profile-setting weight observation synchronization in `packages/api/src/repositories/profile-update-repository.ts`;
- activity-file evidence reconciliation in `packages/api/src/application/activities/reconcile-activity-evidence.ts`;
- onboarding/provider adapters for non-threshold profile observations, which must preserve source observation time and provenance.

## Read policy

Use an explicit projection instead of returning “some rows”:

- **Raw history:** audit/debug view; includes superseded evidence.
- **Effective history:** athlete-facing history after the owning correction and deletion policy is applied.
- **Latest effective as-of:** calculations and current settings; deterministic order is `recorded_at DESC` plus a stable tie-break.
- **Eligible effort curve:** analytics/planning; requires current accepted artifact ownership and accepted segment revision before filtering through the Core activity-effort evidence policy.

Do not:

- return persistence rows as accidental public DTOs;
- use `created_at`, `updated_at`, or request time as observation time;
- select a threshold independently in a router, repository, or app;
- treat a provider summary as stronger than linked activity-file evidence;
- load unbounded history into UI or planning paths;
- infer trust from a non-null activity ID while discarding provenance.

## Change checklist

Any change that reads or writes either table must answer in code review:

1. Which projection is required: raw, effective, latest-as-of, or eligible curve?
2. What is the exact owner predicate, and are linked resources owner-consistent?
3. What instant does `recorded_at` represent, and what is the calculation `asOf`?
4. What canonical unit crosses the DB/API/Core boundary?
5. Which source/method/provenance variant is produced or accepted?
6. Is replay idempotent, and what stable identity enforces it?
7. What happens on correction, clearing, activity deletion, and profile deletion?
8. Is ordering deterministic and work bounded? Does the index match the predicate and order?
9. Which focused test proves ownership, temporal, unit, provenance, and correction behavior?
10. Does the change need DB verification, API/Core tests, and client contract/parity coverage?

## Verification expectations

- Core policy or calculation changes: focused Core tests plus `@repo/core` type checking.
- API read/write changes: focused router/application tests plus `@repo/api` type checking; use live-DB tests for ownership, constraints, concurrency, or SQL semantics.
- Schema, constraint, index, RLS, or migration changes: the full `@repo/db db:verify` workflow.
- Client adapters: prove that IDs, observation time, canonical units, source, method, and provenance survive into the Core snapshot.

Before adding an index, inspect a representative query plan and workload. Current common effort access paths combine profile, category, effort type, duration, and recorded time; single-column profile indexes alone may not remain sufficient as history grows.

## Open design work

These changes require separate decisions and migrations rather than incidental fixes:

- immutable/versioned correction semantics and historical transaction-time reconstruction;
- first-class raw, effective, and latest-as-of API projections;
- metric-specific database unit/range constraints and discriminated provenance checks;
- structural owner consistency for `profile_metrics.reference_activity_id`;
- durable generated/provider/test operation identities;
- keyset pagination and workload-proven composite indexes;
- retention behavior when source activities or profiles are deleted.
