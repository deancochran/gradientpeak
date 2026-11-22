# Canonical best-effort extraction specification

**Calculation version:** `best-effort-extraction-v1`

- **Current boundary:** callers provide one ordered sample timeline. Each sample is
  `{ timestampSeconds, value, included? }`; `value` is finite, nonnegative, and nullable. The
  owning activity-file boundary converts source `Date` values to absolute UTC Unix seconds once.
  Core also permits a consistently relative seconds timeline, but a call may not mix clocks.
- **Interval convention:** the current observation describes the preceding half-open/right-closed
  interval `(previous timestamp, current timestamp]`. The first accepted observation anchors time
  and contributes no duration. Exact effort boundaries use the same seconds timeline and the
  earliest window wins a numeric tie.
- **Metrics and units:** one implementation handles power (`watts`), raw speed and grade-adjusted
  speed (`meters_per_second`), and heart rate (`bpm`). Metric identity affects units and provenance,
  not window mathematics.
- **Window formula:** a candidate value is the duration-weighted arithmetic mean over exactly the
  requested duration. Candidate starts include every source boundary and every source boundary
  shifted backward by the requested duration; these are all extrema of a piecewise-constant fixed
  window. No output is rounded.
- **Completeness:** a numeric result requires 100% contributing coverage inside one uninterrupted
  segment. `null` excludes its interval and resets the segment. `included: false` is known
  pause/rest/exclusion, excludes its interval, and resets the segment. An interval longer than
  `maxGapSeconds` is wholly excluded and resets the segment. None of these intervals is compacted,
  imputed, or bridged.
- **Coverage:** diagnostics retain source span, contributing, gap, missing, and inactive durations;
  sample/order counts; unpositioned source-value count; maximum continuous duration; and source
  time coverage. Source coverage is contributing / (contributing + gap + missing); known inactive
  time is outside that denominator. Every numeric window reports its exact duration as contributing
  time and `windowCoverage: 1`.
- **Ordering:** duplicate and reversed samples are ignored without replacing the last accepted
  timestamp anchor and are counted. Invalid numeric values are rejected. Work is bounded to
  1,000,000 samples, 64 unique durations, and 14,400 seconds per duration.
- **Evidence status:** `available` means a complete window from otherwise complete positioned
  source evidence. `partial` still has a complete winning window but the wider source contains a
  gap, missing interval, timestamp anomaly, or unpositioned value; its reason is
  `source_incomplete`. `unavailable` carries `no_samples`, `no_contributing_intervals`, or
  `insufficient_contiguous_coverage` and never carries a fabricated value.
- **Activity evidence:** the API persists only numeric windows that pass modality plausibility, but
  the segment analysis retains every extraction result, including unavailable reasons. Persisted
  effort provenance retains activity and segment IDs, source-series identity, exact absolute and
  activity-relative boundaries, exact duration and coverage, extraction status/reason, and this
  calculation version. `recorded_at` is the exact effort end instant.
- **Threshold propagation:** automatic LTHR uses the same canonical 1,200-second HR result (95%,
  rounded to integer bpm), and its metric observation time/provenance come from that exact window.
  FTP and speed threshold selection continue to consume the persisted canonical effort rows.

The cycling performance kernel remains outside this extraction specification. Its Step 2 contracts,
policy, equations, and claim boundaries are defined in
`../cycling-performance/cycling-duration-performance.spec.md`.
