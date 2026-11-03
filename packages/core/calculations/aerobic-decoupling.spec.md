# Aerobic decoupling specification

**Calculation version:** `aerobic-decoupling-v1`
**Qualification policy:** `aerobic-analysis-qualification-v1`

- **Purpose, input, units, and modality:** aerobic decoupling compares output-to-HR Efficiency
  Factor between two halves of one qualified steady effort. It consumes the same timestamped
  `{ timestampSeconds, output, heartRateBpm, included? }` contract and interval convention as
  `aerobic-efficiency-factor-v1`. Cycling uses watts and `watts_per_bpm`; running uses grade-adjusted
  metres per second and `meters_per_second_per_bpm`. The returned decoupling unit is a ratio.
  Unsupported or mixed modality/unit identity is `unavailable`; cycling and running EF values are
  never compared.
- **Contributing time and halves:** apply the EF gap, pause, missing, zero-HR, ordering, and coverage
  rules first. Split the remaining cumulative contributing elapsed time into two exactly equal
  durations. If the midpoint falls inside an interval, that interval is divided proportionally.
  Pauses, missing intervals, and gaps consume no half duration, are never bridged, and reset the
  contributing segment. Source sample count is not a split or weighting basis.
- **Half statistics and formula:** output and HR are independently duration-weighted within each
  half. `EF1 = meanOutput1 / meanHR1`, `EF2 = meanOutput2 / meanHR2`, and
  `decoupling = (EF1 - EF2) / EF1`. A positive result means EF declined; a negative result means EF
  improved. Equal half EFs return a valid numeric `0`, not missing data. A zero first-half EF cannot
  be a denominator and is `unavailable`.
- **Minimum evidence and coverage:** total contributing duration must be at least 1,200 seconds and
  each contributing-time half must contain at least 600 seconds. Output, HR, and paired coverage
  over eligible non-paused source time must each be at least 90%.
- **Steady-effort qualification:** the duration-weighted output coefficient of variation defined by
  the EF specification must be no greater than 0.10 for the full contributing effort and for each
  half. This prevents a workout structure or output step-change from being mislabeled as aerobic
  drift. Mean output must be positive.
- **Gaps, pauses, missing values, and zero:** a known pause is excluded from coverage and resets the
  segment. Missing output, missing HR, and zero HR are excluded, penalize their respective coverage,
  and reset the segment. An otherwise complete interval longer than five seconds is wholly excluded
  as a gap and penalizes all coverage. Measured zero output is retained as output evidence, while an
  all-zero effort fails positive-output qualification. Duplicate and reversed timestamps are
  ignored and reported.
- **Statuses and reasons:** `available` carries a qualified full-precision ratio from complete source
  evidence. `partial` carries a qualified ratio plus `source_incomplete` after safely excluded gap,
  missing, zero-HR, duplicate, or reversed evidence; known pauses alone remain `available`.
  `unavailable` carries `null` and the EF reasons where applicable, with
  `insufficient_half_duration` for the two-half minimum and `zero_first_half_efficiency` for an
  unusable first-half denominator. Unavailable or mixed inputs never fall back to zero.
- **Rounding and persistence:** calculations return full JavaScript number precision; presentation
  rounding is external. Legacy nullable scalar persistence may store only a numeric `available` or
  `partial` value. It must store `null` for `unavailable`, while the structured result retains status,
  identity, qualification, coverage, and reason.
