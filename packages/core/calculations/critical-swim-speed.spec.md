# Critical Swim Speed (CSS) specification

**Protocol:** `css_400m_200m`
**Calculation version:** `critical-swim-speed-400m-200m-v1`

- **Inputs and units:** two independently timed active efforts: `time400Seconds` for exactly 400 m
  and `time200Seconds` for exactly 200 m. Both are positive whole seconds. A persisted observation
  additionally owns an explicit observation instant and operation identity; neither is inferred by
  the calculation.
- **Formula:** `cssSecondsPer100m = (time400Seconds - time200Seconds) / 2` and
  `cssMetersPerSecond = 100 / cssSecondsPer100m`. Exact effort speeds are `400 / time400Seconds`
  and `200 / time200Seconds` metres per second.
- **Timing, sampling, and rest:** each input is active effort duration only. Timestamps inside an
  effort, sampling rates, inter-effort recovery, pool idle time, and session elapsed time are not
  protocol inputs. Rest between the two efforts is therefore neither added to nor estimated from
  either duration.
- **Missing, zero, order, and plausibility:** both efforts are required; zero and non-finite values
  are invalid. The 400 m duration must be greater than twice the 200 m duration, and both efforts
  plus the derived pace must satisfy the existing local input bounds. Argument field order has no
  meaning; distance labels do.
- **Minimum evidence:** exactly the two qualified timed efforts are the atomic minimum. One effort,
  a generic swim summary, or an unlinked pair is insufficient. This version has no meaningful
  numeric partial CSS result.
- **Statuses:** `evaluateCssFrom400m200mTest` returns `available` with the version, protocol, CSS,
  and exact efforts, or `unavailable/invalid_protocol` with all numeric fields `null`. The strict
  compatibility calculator parses and throws for programmer misuse; callers handling untrusted or
  incomplete evidence use the explicit evaluator.
- **Rounding:** formula results retain JavaScript number precision. Whole-second input validation is
  part of this protocol; display pace rounding is outside it.
- **Claim boundary:** this contract establishes only the local two-effort calculation. It does not
  infer a full swim performance curve, a sustainable duration, or an external provider score.
