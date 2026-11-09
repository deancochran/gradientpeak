# Aerobic Efficiency Factor specification

**Calculation version:** `aerobic-efficiency-factor-v1`
**Qualification policy:** `aerobic-analysis-qualification-v1`

- **Purpose and modality identity:** Efficiency Factor (EF) relates external output to heart-rate
  cost for one steady aerobic effort. Cycling output is watts and returns `watts_per_bpm`; running
  output is grade-adjusted speed in metres per second and returns
  `meters_per_second_per_bpm`. Those values have different dimensions and must never be compared or
  pooled. Unsupported modalities, unsupported units, and a cycling/running unit mismatch are
  `unavailable`.
- **Input and interval convention:** input is an ordered stream
  `{ timestampSeconds, output, heartRateBpm, included? }`. Timestamps are finite absolute or relative
  seconds. Output is finite, nonnegative output in the declared unit or `null`; heart rate is finite
  `0..300 bpm` or `null`. The current observation describes `(previous timestamp, current
  timestamp]`; the first accepted observation only anchors time. A batch is bounded to 1,000,000
  observations.
- **Formula and time basis:** only intervals with compatible output and positive heart rate
  contribute. For contributing durations `dt`, `meanOutput = sum(output * dt) / sum(dt)`,
  `meanHR = sum(HR * dt) / sum(dt)`, and `EF = meanOutput / meanHR`. Source sample count never weights
  either mean.
- **Gaps, pauses, ordering, and reset:** `included: false` is known paused/rest time; it is excluded
  from coverage and resets the contributing segment. Missing output, missing heart rate, or zero
  heart rate excludes that interval, counts against the relevant coverage, and resets the segment.
  Otherwise an interval of at most five seconds contributes; a longer interval is wholly excluded
  as a gap, counts against all coverage, and resets the segment. Missing evidence takes precedence
  over the gap classification. Duplicate and reversed timestamps are ignored without moving the
  accepted timestamp anchor and are reported as incomplete source evidence.
- **Zero semantics:** `0` output is measured output, not missing data, and contributes to coverage.
  The duration-weighted mean output must nevertheless be positive for EF to represent an effort.
  `0 bpm` cannot be a ratio denominator and is tracked separately from missing HR. An unavailable
  calculation never returns a numeric zero.
- **Coverage:** eligible duration is every forward, non-paused interval, including missing and gap
  time. Output coverage, HR coverage, and paired coverage are their usable durations divided by
  eligible duration. Known pause time is outside each denominator.
- **Qualification:** EF requires at least 600 seconds of contributing elapsed time; output, HR, and
  paired coverage must each be at least 90%. Steady effort requires the duration-weighted population
  coefficient of variation of contributing output,
  `sqrt(sum(dt * (output - meanOutput)^2) / sum(dt)) / meanOutput`, to be no greater than 0.10.
- **Statuses and reasons:** `available` carries a qualified full-precision value from complete source
  evidence. `partial` carries a qualified value plus `source_incomplete` when a gap, missing value,
  zero-HR interval, duplicate, or reversal was safely excluded; known pauses alone do not make a
  result partial. `unavailable` carries `null` plus one of `invalid_input`, `unsupported_modality`,
  `unsupported_output_unit`, `modality_mismatch`, `no_samples`, `missing_output`,
  `missing_heart_rate`, `zero_heart_rate`, `no_contributing_intervals`, `insufficient_duration`,
  `insufficient_output_coverage`, `insufficient_heart_rate_coverage`,
  `insufficient_paired_coverage`, `zero_output`, or `unsteady_effort`.
- **Rounding:** all weighting, qualification, diagnostics, and EF values retain JavaScript number
  precision. Presentation rounding is external to this calculation.
