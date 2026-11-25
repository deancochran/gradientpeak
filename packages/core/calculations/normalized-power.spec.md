# Cycling Normalized Power specification

**Calculation version:** `cycling-normalized-power-v1`
**Normalized-series version:** `fixed-one-second-normalized-series-v2`

- **Input:** ordered observations `{ timestampSeconds, powerWatts, included? }`. Timestamps are
  finite absolute or relative seconds. Power is finite, nonnegative watts or `null` when missing.
  The current observation describes `(previous timestamp, current timestamp]`; the first accepted
  observation only anchors time. `0 W` is measured coasting, never missing data. A batch is bounded
  to 1,000,000 source observations and 10,000,000 materialized one-second endpoints.
- **Window and formula:** each uninterrupted contributing segment is resampled on a segment-aligned
  one-second grid. At every completed grid second with a full trailing 30 seconds, calculate the
  duration-weighted mean power. NP is the fourth root of the arithmetic mean of those rolling means
  raised to the fourth power. Exactly 30 contributing seconds yields one rolling observation.
- **Gaps, pauses, and missing values:** an explicitly inactive interval (`included: false`) is rest,
  is excluded, and resets the window. Otherwise a `null` interval is missing, is excluded, and
  resets the window. Otherwise an interval of at most 5 seconds contributes; a longer interval is
  a gap, is wholly excluded, and resets the window. This precedence keeps known rest distinct from
  missing evidence. Additional samples that describe the same piecewise-constant signal do not
  change the one-second representation.
- **Timestamp anomalies:** duplicate and reversed observations are ignored without replacing the
  last accepted observation and are counted in diagnostics. They make an otherwise numeric result
  `partial`.
- **Minimum evidence and coverage:** one complete uninterrupted 30-second window is required.
  Coverage is contributing time divided by contributing + gap + missing time; known paused time is
  outside that denominator. No complete window is `unavailable`, even if shorter valid fragments
  exist.
- **Result:** `available` carries complete numeric watts; `partial` carries numeric watts plus
  `source_incomplete` after a gap, missing interval, duplicate, or reversal; `unavailable` carries
  `null` plus `no_samples`, `no_contributing_intervals`, or `insufficient_window`. Invalid numeric,
  sparse, or misaligned input is rejected rather than converted to missing or zero.
- **Rounding:** calculations and returned watts retain JavaScript number precision. Presentation
  rounding is outside this calculation.
