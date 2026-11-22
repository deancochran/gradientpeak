# Duration-performance foundation v1

**Foundation:** `duration-performance-foundation-v1`
**Evidence policy:** `duration-performance-evidence-v1`
**Canonical source calculation:** `best-effort-extraction-v1`

## Contract and claim boundary

The foundation consumes already-qualified exact effort-window evidence for cycling power, running
speed, or swimming speed. It never accepts stream samples, extracts a best effort, applies grade
adjustment, reconstructs pool timing, or changes a source value. Category models interpret the
qualified value; the foundation owns only evidence qualification, deterministic curve construction,
coverage, time policy, identity, confidence, and abstention.

Every canonical effort carries separate observation and immutable evidence IDs, an evidence
revision, athlete/activity/segment identity, observation instant, category/metric/value/unit,
category evidence context, and source calculation version. Provenance repeats the observation,
activity, segment, duration, exact window offsets, complete contributing duration,
`windowCoverage=1`, source-time coverage, extraction status/reason, source series, and calculation
version. Any disagreement is invalid at the Zod boundary. Inputs are capped at 2,000 efforts and
14,400 seconds per effort.

## Selection, time, and curve policy

- Evidence observed after `assessmentAsOf` is excluded.
- The freshness window is exactly 90 days; its lower instant is inclusive.
- A canonical partial window remains eligible only with source-time coverage of at least 0.8 and
  propagates partial coverage.
- Duration-aware Core plausibility review excludes a value; it never clamps it.
- For each exact duration, the strongest eligible value wins. Ties use newest `recordedAt`, then
  lexicographically smallest evidence ID.
- Lower same-duration observations remain in `supersededEvidenceIds`.
- A selected curve must be non-increasing as duration increases. Any increase causes abstention.
  V1 does not delete a suspected outlier, isotonic-fit, winsorize, or repair source evidence.
- A truncated bounded read makes every result derived from that read unavailable.

Coverage records exact anchors and bands, minimum distinct durations and activities, observed
durations, eligible/selected counts, independent activities, and complete/partial source counts.
Missing optional curve anchors produce a numeric `partial` curve; missing evidence, truncation, or
monotonic conflict produces `unavailable` with null value.

## Shared fit and confidence

Cycling Critical Power and running Critical Speed use one unit-neutral inverse-duration OLS kernel:

```text
value = intercept + reserve / durationSeconds
```

The category owns units, bounds, names, and claim language. The shared fit enforces duration bands,
minimum points, multiple winning activity IDs, parameter bounds, R², normalized RMSE, and
leave-one-point-out stability. It never removes a residual outlier to make a fit pass.

Confidence is categorical decision metadata, not a probability. It reflects source completeness,
anchor density, independent activity count, and fit quality. `available`, `partial`, and
`unavailable` are explicit discriminated states; unavailable results claim no confidence.

## Historical and change identity

Every category model publishes:

- `historySeriesFingerprint`: stable for athlete/category/model-variant history;
- `evidenceSetFingerprint`: changes when selected evidence identity, revision, source calculation,
  or calculation facts change; and
- `calculationFingerprint`: additionally changes with assessment instant or model/policy version.

Fingerprints use canonical JSON plus FNV-1a as portable identity aids, not cryptographic integrity.
Every output also retains its exact source evidence IDs, expiry, calculation version, and
recalculation triggers.

## Verification assets

Literal category fixtures live in
`__tests__/fixtures/duration-performance-v1.ts`. Independent equation references live in
`__tests__/support/independent-reference.ts`; they import no production calculator or policy. Seeded
properties use seed `0xd0a42026` for category separation, ordering/identity, monotonicity/outliers,
recency, multiple-activity requirements, and abstention.

This is a fixed Core contract, not a plugin registry or compatibility layer.
