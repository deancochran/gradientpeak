# Running duration-performance v1

**Model:** `running-duration-performance-v1`
**Input:** `running-duration-performance-input-v1`
**Evidence policy:** `running-duration-performance-evidence-v1`

## Evidence lanes

The only curve source is canonical qualified run/speed evidence in metres per second. Every effort
is explicitly `raw_speed` or `grade_adjusted_speed`, and provenance must name the matching source
series. The model does not calculate grade adjustment. Fresh eligible raw and adjusted evidence may
not be combined: a mixed input makes the complete running model unavailable with
`mixed_raw_grade_adjusted_evidence`. The lane is retained in every curve point, parameter, level,
and history identity.

## Curve, Critical Speed, and distance reserve

The speed curve uses the shared strongest-per-exact-duration and abstain-without-repair policy.
Pace is a presentation of the same selected value:

```text
paceSecondsPerKilometer = 1000 / speedMetersPerSecond
```

Full curve coverage requires exact 30, 60, 180, 300, 600, 1,200, 1,800, and 3,600-second points.
A valid sparse curve is partial.

Critical Speed and **GradientPeak distance reserve** fit selected points at fixed candidate
durations `[180, 300, 600, 900, 1200, 1800]`:

```text
speedMetersPerSecond = criticalSpeed + gradientPeakDistanceReserveMeters / durationSeconds
```

Acceptance requires at least four durations, one point in 180–360, 361–900, and 901–1,800-second
bands, at least two winning activities, Critical Speed in 1–8 m/s, reserve in 20–1,000 m, R² at
least 0.95, normalized RMSE at most 0.05, and bounded leave-one-out changes (0.15 Critical Speed,
0.35 reserve). The reserve is a two-parameter model distance term, not a direct physiology measure.

## Modeled threshold, durability, and levels

Modeled threshold pace requires an accepted fit plus exact 1,200-second evidence:

```text
modelSpeed1200 = criticalSpeed + distanceReserve / 1200
modeledThresholdSpeed = 0.95 * modelSpeed1200
modeledThresholdPace = 1000 / modeledThresholdSpeed
```

The modeled speed must exceed Critical Speed. This is a GradientPeak planning anchor, not lactate
threshold or a race prediction. Durability is exact 3,600-second speed divided by exact
1,200-second speed. It requires two winning activities for `available`; one activity is partial.
It is cross-duration retention, not measured late-run fatigue resistance.

Individualized pace levels cover short duration, distance reserve, modeled threshold, long
duration, and durability. A level is available only when its depended-on capability is available;
partial capability evidence never becomes a prescription. The distance-reserve level additionally
requires an exact 60-second speed anchor; the fitted reserve alone cannot supply its pace envelope.
Current levels are one-bout evidence envelopes with no fabricated recovery prescription.

The model abstains for truncated reads, no eligible evidence, mixed raw/adjusted lanes,
non-monotonic selected curves, poor/unstable/out-of-bounds fits, missing 1,200-second threshold
evidence, missing durability durations, or unavailable level dependencies.
