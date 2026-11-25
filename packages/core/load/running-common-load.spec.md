# Running Common Load specification

**Model:** `gradientpeak_relative_load`
**Calculation version:** `1`
**NGP input version:** `running-normalized-graded-pace-v1`

- **Input and units:** a versioned running NGP result in metres per second, a current positive
  running threshold speed in metres per second (canonically converted from threshold pace), and
  known eligible active/moving duration in seconds. Threshold quality and evidence identity remain
  attached. Elapsed paused/rest time is not eligible or contributing duration.
- **Formula:** normalized intensity = `ngpMetersPerSecond / thresholdSpeedMetersPerSecond`; Common
  Load = `(contributingDurationSeconds / 3600) * normalizedIntensity^2 * 100`. One active hour at
  threshold is 100, duration scales linearly, and intensity scales quadratically. Values are not
  provider scores and make no external parity or additional physiological claim.
- **NGP evidence and coverage:** NGP owns timestamp, exact speed/elevation alignment, grade, window,
  gap, pause, missing, zero, duplicate, reversal, and minimum-window semantics. A complete NGP uses
  active/moving duration. A partial NGP can produce only partial Common Load and uses its evidenced
  contributing duration without projecting across missing time. An explicitly unavailable NGP
  cannot silently fall back to an unversioned grade-adjusted scalar or zero.
- **Missing and invalid evidence:** missing threshold yields `threshold_missing`; unavailable NGP or
  missing running data yields no numeric Load; stale/truncated threshold evidence, invalid duration,
  mismatched NGP scalar/result, and normalized intensity outside `[0, 1.5]` remain unavailable.
  Measured NGP zero is valid intensity zero, while known paused/rest intervals contribute neither
  duration nor Load.
- **Statuses:** `available` requires complete final activity evidence, current threshold provenance,
  and complete eligible-duration coverage. `partial` may carry numeric Load and intensity only with
  complete provenance plus explicit contributing duration, eligible duration, and coverage. Live
  recording output remains `partial` authority even when its current evidence is fully covered.
  `unavailable` never represents missing evidence as zero.
- **Aggregation and rounding:** compatible Loads add, but any partial or unavailable member prevents
  a complete aggregate. Aggregate intensity is the duration-weighted root-mean-square implied by
  summed Load. Formula inputs and results retain full precision; display rounding is external.
