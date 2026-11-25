# Running Normalized Graded Pace specification

**Calculation version:** `running-normalized-graded-pace-v1`
**Normalized-series version:** `fixed-one-second-normalized-series-v2`

- **Input and units:** ordered observations
  `{ timestampSeconds, speedMetersPerSecond, elevationMeters, included? }`. Timestamps are finite
  absolute or relative seconds. Speed is finite, nonnegative metres per second or `null` when
  missing. Elevation is finite metres or `null` when missing. Speed and elevation at the current
  timestamp jointly describe `(previous timestamp, current timestamp]`; the first accepted sample
  only anchors time. A batch is bounded to 1,000,000 source observations and the shared normalized
  series bounds its one-second work.
- **Grade handling:** interval grade is `(current elevation - previous elevation) /
  (current speed * interval seconds)`. Zero speed is measured zero and uses grade zero. Grade is
  bounded to `[-0.45, 0.45]`, then adjusted speed is `speed * clamp(cost(grade) / cost(0), 0.5, 3)`
  where `cost(g) = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6`. This is the declared
  v1 numerical model, not a claim that it captures every physiological or terrain effect.
- **Alignment:** speed, elevation, timestamp, and optional inclusion evidence stay at the same
  source position through grade adjustment and normalization. Missing elevation breaks the
  interval ending at that point and the next interval that lacks a previous elevation anchor.
  Parallel arrays with different lengths, sparse entries, or invalid numeric values are rejected.
  Independently timestamped import streams are exact-timestamp aligned; unmatched evidence is
  represented as `null`, never shifted or compacted into another interval.
- **Window and formula:** every uninterrupted contributing segment is resampled on a
  segment-aligned one-second grid. At every completed grid second with a full trailing 30 seconds,
  compute the duration-weighted mean adjusted speed. NGP is the fourth root of the arithmetic mean
  of those rolling means raised to the fourth power. Exactly 30 contributing seconds produces one
  rolling observation.
- **Gaps, pauses, missing values, and zero:** `included: false` is known paused/rest time; it is
  excluded and resets the window. Otherwise a missing speed or required elevation is excluded and
  resets the window. Otherwise an interval up to 5 seconds contributes; a longer interval is wholly
  excluded as a gap and resets the window. Measured `0 m/s` contributes zero and is not missing.
  Additional samples describing the same piecewise-constant signal do not change the one-second
  representation.
- **Timestamp anomalies:** duplicate and reversed observations are ignored without replacing the
  last accepted elevation anchor and are counted in diagnostics. They make an otherwise numeric
  result `partial`.
- **Minimum evidence and coverage:** one complete uninterrupted 30-second window is required.
  Coverage is contributing time divided by contributing + gap + missing time; known paused time is
  outside that denominator. Active/moving inclusion evidence takes precedence over elapsed time.
- **Result and rounding:** `available` carries complete full-precision metres per second; `partial`
  carries numeric metres per second plus `source_incomplete` after a gap, missing interval,
  duplicate, or reversal; `unavailable` carries `null` plus `no_samples`,
  `no_contributing_intervals`, or `insufficient_window`. No calculation or result is rounded;
  presentation rounding is external.
