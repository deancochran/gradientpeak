# Cycling Common Load specification

**Model:** `gradientpeak_relative_load`
**Calculation version:** `1`

- **Input:** cycling Normalized Power in watts, a current positive cycling threshold in watts, and
  positive contributing active duration in seconds. Threshold quality and evidence identity remain
  attached to the result. Paused/rest time is not contributing duration. Missing power, threshold,
  or duration remains missing; measured `0 W` is valid coasting.
- **Formula:** normalized intensity = `normalizedPowerWatts / thresholdPowerWatts`; Common Load =
  `(contributingDurationSeconds / 3600) * normalizedIntensity^2 * 100`. Thus one hour at intensity
  1 is 100, duration scales linearly, and intensity scales quadratically. No provider-specific or
  external parity is implied.
- **Gaps, missing values, and timestamps:** the cycling Normalized Power result owns timestamp,
  gap, pause, missing, duplicate, reversal, minimum-window, and source-coverage semantics. Common
  Load must not promote an incomplete normalized-power result to complete evidence.
- **Result:** `available` requires complete activity duration, complete supported activity evidence,
  and current threshold provenance. `partial` may carry a numeric Load and intensity only with
  complete provenance and explicit eligible duration/coverage; aggregation must remain `partial`
  whenever any member is partial or unavailable. `unavailable` carries no numeric Load for missing
  threshold, missing/insufficient activity evidence, missing duration, invalid input, stale evidence,
  unsupported modality, or out-of-range intensity. Unavailable is never represented as zero.
- **Bounds and aggregation:** normalized intensity is accepted from 0 through 1.5 without clamping.
  Compatible activity Loads add; aggregate intensity is the duration-weighted root-mean-square
  implied by summed Load. Known rest contributes neither duration nor Load.
- **Rounding:** formula inputs and results remain full precision. Any display rounding is external.
