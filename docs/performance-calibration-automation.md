# Threshold calibration automation

## Status

This is the accepted, **undeployed hard-cut direction** for activity-derived
threshold calibration. Gate 1 owns only the framework-free Core contract,
evaluator, lifecycle, exact-window support, and tests. It does not authorize a
commit, push, deployment, database or API change, app integration, migration, or
production mutation.

There is no dual-write, compatibility-selection, provider-summary, CSS,
critical-power, critical-speed, or stored-expiry path in the accepted design.
Later gates must migrate callers to this contract before deployment and remove
the superseded calibration path rather than keep two authorities. A preexisting
Core performance-model adapter may remain during Gate 1 only to keep its
separately owned public contract intact; it is not qualification authority.

## Product contract

One shared Zod-first threshold selector evaluates exact-window observations,
owns measurement priority and fallback, and returns the candidate. There is no
second qualification algorithm or compatibility wrapper. One shared
deterministic incremental lifecycle turns qualified candidates into a
provisional or confirmed calibration. Activity-category policy supplies data,
not alternate algorithms.

| Sport | Threshold metric | Preferred series | Explicit fallback | Exact window | Conversion |
| --- | --- | --- | --- | ---: | ---: |
| bike | power | power | none | 1,800 s | `window × 0.95` |
| run | speed | grade-adjusted speed | raw speed | 1,800 s | `window × 1` |
| swim | speed | speed | none | 900 s | `window × 1` |

The policy and plausible threshold ranges are versioned. The initial plausible
ranges are 50–2,000 W for bike, 0.5–12 m/s for run, and 0.25–3 m/s for swim.
They are safety bounds, not estimates and not user-facing promises.

## Exact-window qualification

Threshold extraction consumes only the best result for the configured exact
duration. It must not substitute the longest continuous effort, a nearby
duration, an activity average, a duration-performance model, a CSS protocol, or
a critical-power/critical-speed model.

There is no threshold-specific maximum activity duration. A long activity is
eligible when its configured exact window has at least 95% coverage and no gap
longer than 10 seconds. The canonical best-effort extractor continues to bound
samples and requested durations for computational safety; that is not an
activity-duration eligibility rule.

Every configured measurement passes the same closed quality gates independently,
in deterministic order:

1. the source is accepted;
2. ownership of the selected source series is verified;
3. exactly one observation exists for that measurement;
4. the exact configured duration exists and its observation is complete;
5. the winning window has at least 95% coverage;
6. extraction used a maximum gap of at most 10 seconds;
7. the converted value is finite and inside the versioned plausible range.

Duplicate eligible observations are ambiguous and rejected for that measurement.
Input order never resolves ambiguity. Gaps, missing values, and pauses are never
compacted into a threshold window.

Run selection always evaluates both configured measurements. A qualified
grade-adjusted 1,800-second observation has priority. If grade-adjusted speed is
missing or rejected for **any** reason—including source acceptance, ownership,
duration, completeness, coverage, gaps, plausibility, or ambiguity—an
independently qualified raw-speed 1,800-second observation is selected. The
selector does not maintain a list of fallback-eligible rejection reasons; it
simply picks the first qualified measurement in policy order. Its result retains
the evaluation diagnostics for both grade-adjusted and raw speed. Bike power and
swim speed each have one configured measurement and therefore no fallback.

There are no gates for labels, maximum activity duration, duplicate performance
models, model-history quality, stored freshness, expiry availability, CSS, or a
critical-power/critical-speed dependency.

## Lifecycle

The production lifecycle is an incremental, versioned state machine. It accepts
one qualified candidate at a time in `(observedAt, evidenceId)` keyset order and
returns an action (`provisional`, `confirm`, `increase`, `retain`, or `decrease`),
the exact selected value, and bounded state. Duplicate retained evidence/activity
identities and out-of-order keys fail closed. The caller owns chronological
pagination and the durable uniqueness boundary.

State retains only the current threshold, the last processed cursor, and pending
evidence required by the active confirmation/decrease policy. It never retains a
lifetime activity list. Confirmation evidence is bounded to two observations and
42 days. Decrease evidence is bounded to two observations and 56 days; with a
two-observation decision, at most one pending decrease is retained. Expired or
incompatible pending evidence is pruned deterministically. The state schema is
`threshold-lifecycle-state-v1`; the policy schema is
`threshold-policy-schema-v1`.

The in-memory convenience resolver has no lifetime-candidate cap. It validates
identities, filters by explicit `asOf`, sorts by the same key, and folds only
through the incremental transition. It is not a separate lifecycle algorithm.

- The first qualified candidate publishes a provisional calibration.
- A second independent candidate within the 42-day window and within 3% confirms
  it using their median.
- A value at least 3% higher publishes an immediate update.
- Movement smaller than 3% is noise and retains the current value and effective
  instant.
- One material decrease retains the current value.
- Two independent decreases inside the 56-day window that are mutually within 3%
  publish their median.

Consistency uses the symmetric max/min spread
`(maximum - minimum) <= 0.03 × minimum` with a scale-aware floating tolerance.
Exactly 3% is inclusive; just over 3% is rejected regardless of evidence order.

Lifecycle output contains method, value, effective instant, policy versions,
publication reason, and selected evidence/activity provenance. It does not store
freshness or expiry.

## Freshness

Freshness is a pure projection of:

```text
asOf - calibration.effectiveAt compared with the method's freshness policy
```

The initial method policy is 90 days for all three sports. The boundary is
half-open: age below 90 days is fresh; age at or above 90 days is stale. A future
calibration cannot be evaluated at an earlier `asOf`. No stored `fresh`, `stale`,
or `expiresAt` field is authoritative in the accepted contract.

## Gate boundaries

Gate 1 must not change duration-performance, cycling-performance, running,
swimming, database, API, or app public contracts. Later gates must adapt those
owners to the new threshold contract as a hard cut and prove there is one runtime
authority before deployment.

Gate 1 verification is:

- exact sport configuration and conversions;
- long-activity eligibility through an exact window;
- missing series, short source, ambiguity, incompleteness, ownership, accepted
  source, bounded gaps, and plausibility rejection;
- first provisional, independent confirmation, material increase, noise
  retention, one-decrease retention, repeated-decrease update;
- incremental/replay parity, explicit-as-of determinism, chronological-key and
  duplicate rejection, bounded state, and 1,000 sequential activities;
- raw run fallback after every grade-adjusted rejection class while retaining
  both measurement diagnostics;
- freshness derived without stored expiry;
- focused Core tests, Core typecheck, and `git diff --check`.
