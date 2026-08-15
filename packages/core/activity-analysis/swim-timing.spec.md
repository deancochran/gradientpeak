# Swim active/rest timing specification

**Calculation version:** `swim-active-rest-duration-v1`

- **Inputs and units:** positive session/segment elapsed duration in seconds, owned pool-length
  records, and an optional expected active-length count. Supported length roles are `active`,
  `idle`, and `rest`.
- **Duration selection:** an active length uses positive finite timer time, falling back to elapsed
  time. An idle/rest length uses positive finite elapsed time, falling back to timer time. Active
  durations add to active/moving swim time; idle and rest durations add to known rest time.
- **Rest behavior:** known rest is never active, moving, threshold, distance-rate, or Load duration.
  For complete length timing, `active + rest = elapsed`. A session's explicit complete timer and
  moving fields retain adapter precedence; complete owned lengths fill timing when those fields are
  absent, and provider active time remains a partial fallback.
- **Missing and contradictory evidence:** an unknown length role, missing supported duration,
  active-count mismatch, or unaccounted elapsed residual yields `partial/source_incomplete` while
  preserving independently known active/rest totals. Known length duration above elapsed duration
  is `unavailable/invalid_timing`; no usable lengths is `unavailable/no_length_timing`.
- **Minimum evidence:** at least one recognized positive length duration is needed for a partial
  result. Complete status additionally requires every owned length to be recognized and timed, the
  optional active count to match, and all elapsed time to be accounted for.
- **Threshold intensity and Load:** when complete timing supplies active duration, swim speed is
  evidenced distance divided by active duration. The canonical swim threshold is supplied directly
  in meters per second; intensity is `swimSpeed / thresholdSpeed`; Common Load is
  `(activeDurationSeconds / 3600) * intensity^2 * 100`. Partial timing can carry only partial Load;
  unavailable timing cannot fabricate zero or elapsed-time Load.
- **Ordering and rounding:** length totals are additive and independent of record ordering. Core
  calculations retain full precision. The activity-file adapter rounds seconds to persisted whole
  milliseconds only at its timing boundary.
