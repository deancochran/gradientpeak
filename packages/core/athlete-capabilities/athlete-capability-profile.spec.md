# Athlete capability profile and planning projection v1

**Profile contract:** `athlete-capability-profile-v1`
**Composition:** `athlete-capability-composition-v1`
**Planning selection:** `capability-planning-selection-v1`
**Planning projection:** `athlete-capability-planning-projection-v1`

## Boundary

This Core model is a deterministic projection of already-qualified category performance concepts.
It does not read activity streams, extract best efforts, reconstruct timing, fit a duration model,
repair evidence, infer physiology, normalize categories onto a common score, or persist profile
state. Cycling, running, swimming, strength, and general-session kernels remain the owners of their
evidence qualification and calculations.

No phenotype label is accepted or emitted as a planning input. A category concept is numeric only
when its existing semantics match the named capability. In particular, accumulated strength volume,
strength density, repetition/RPE load, general duration/RPE load, and general-session RPE drift are
not coerced into power, speed, reserve, threshold, long-duration, durability, or recovery values.

## Category capability projection

Every category profile has the same six result properties:

- `shortDurationCapacity`
- `anaerobicReserve`
- `thresholdCapacity`
- `longDurationCapacity`
- `durability`
- `repeatedEffortRecovery`

Each result is `available`, `partial`, or `unavailable`. Numeric results carry a nonnegative value,
physical unit, exact measurement basis, source concept metadata, evidence IDs, activity IDs, source
calculation identity, evidence coverage, confidence, freshness/expiry, and recalculation triggers.
Unavailable results have a null value and closed composition reason. A unit and basis remain present
when the category has a compatible source concept that is currently unavailable; both are null when
there is no semantically compatible numeric concept.

V1 selects the following scalar directly from each canonical concept output; it does not derive a
new scalar from raw evidence:

| Category | Capability | Exact projected value |
|---|---|---|
| Bike | Short duration | Existing 60-second maximal-mean power from cycling short-duration capacity |
| Bike | Anaerobic reserve | Existing GradientPeak reserve in joules |
| Bike | Threshold | Existing modeled-threshold planning anchor in watts |
| Bike | Long duration | Existing 3,600-second maximal-mean power |
| Bike | Durability | Existing 1,200-to-3,600-second retention ratio |
| Bike | Repeated effort recovery | Existing cycling result, currently unavailable because no qualified protocol exists |
| Run | Short duration | Existing 60-second maximal-mean speed curve point |
| Run | Anaerobic reserve | Existing GradientPeak distance reserve in meters |
| Run | Threshold | Existing modeled-threshold pace anchor represented as speed |
| Run | Long duration | Existing 3,600-second maximal-mean speed curve point |
| Run | Durability | Existing 1,200-to-3,600-second speed-retention ratio |
| Run | Repeated effort recovery | Unavailable; the running kernel produces no qualified repeat protocol concept |
| Swim | Short duration | Existing pool 60-second sprint-capacity speed |
| Swim | Anaerobic reserve | Unavailable; no reserve concept is produced |
| Swim | Threshold | Not produced; canonical target facts own swim threshold speed |
| Swim | Long duration | Existing 1,800-second aerobic-capacity speed |
| Swim | Durability | Unavailable; no durability concept is produced |
| Swim | Repeated effort recovery | Existing fixed-distance repeat final-speed retention ratio |
| Strength | Repeated effort recovery | Existing fixed-resistance final-repetition retention ratio |
| Strength | Other five capabilities | Unavailable; current session aggregates are not matching performance capacities |
| Other | All six capabilities | Unavailable; duration/RPE and RPE-drift concepts are not matching performance capacities |

The full athlete profile contains zero or one category profile per canonical category at one athlete
and assessment instant. Category profiles are emitted in canonical order. Every result retains the
full source model identity, while the athlete profile retains the ordered source calculation
fingerprints. The source model's confidence and detailed coverage are copied without promotion.

Evidence is current through the exact `expiresAt` instant and expired immediately afterward. A
partial source remains a partial capability. Neither composition nor planning promotes partial
evidence.

## Explicit planning selection

Planning requires a `capability-planning-selection-v1` context with:

- athlete and planning instant;
- an ordered category priority;
- one or more identified goal/planning demands;
- explicit eligible categories for each demand; and
- exact capability, unit, measurement basis, and positive required value.

For each demand, the resolver considers only the explicitly eligible categories in category-priority
order. It selects the first current `available` result with the exact unit and measurement basis.
It may pass over an incompatible category to a later explicitly eligible compatible category, but it
never converts, averages, sums, or otherwise mixes values. If no available candidate exists, a
compatible partial candidate remains `partial`; expired, unavailable, missing, unit-mismatched, and
basis-mismatched candidates produce explicit diagnostics and no comparison.

## Continuous limiter assessment

For a planning-safe available requirement, all v1 capabilities use an `at least` demand:

```text
absoluteGap = max(0, requiredValue - capabilityValue)
relativeGap = absoluteGap / requiredValue
```

Gap values are rounded to nine decimal places for portable deterministic ordering. Positive relative
gaps are ranked descending, then by requirement ID. Equal rounded gaps share one rank group and are
marked as a tie; the model never chooses one tied limiter by category label or input order.

If any requirement is partial or unavailable, known gaps may remain visible, but dominant-limiter
status is `indeterminate`. Complete evidence yields one of `none`, `single`, or `tie`. Missing and
unsupported requirements never receive a zero or default capability value.

## Planning integration and deferrals

`derivePlanningProjection` accepts the capability profile and selection context only through the
optional explicit `capabilityPlanning` input. When absent, its returned shape and all existing plan
derivation are unchanged. When present, it returns the validated capability projection as diagnostic
planning information; v1 does not alter session construction, schedule placement, load, or plan
state from those values.

Step 5 individualized levels and prescriptions are deliberately deferred. Existing category level
outputs are not consumed by this model. Step 6 UI/product experience is also deferred. Persistence,
provider mapping, generic plugins, compatibility aliases, and external performance claims remain out
of scope.
