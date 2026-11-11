# Heart-rate zone duration specification

**Calculation version:** `heart-rate-zone-duration-v1`
**Default maximum accepted gap:** 5 seconds

- **Inputs and units:** ordered samples `{ timestampSeconds, heartRateBpm, included? }`. Timestamps
  are finite absolute or relative seconds. HR is beats per minute or `null` when missing. A sample
  describes `(previous accepted timestamp, current timestamp]`; the first accepted sample anchors
  time and receives no synthetic duration. Batch work is bounded to 1,000,000 samples.
- **Qualified HR:** finite values from 30 through 250 bpm are qualified and rounded to the nearest
  whole-bpm distribution bucket after interval validation. `null` is missing. Zero or a value
  outside the qualified range is invalid/dropout, never measured zero-intensity HR.
- **Timestamp and sampling behavior:** every accepted interval is weighted by its exact duration,
  so regular and irregular representations of the same piecewise-constant signal agree. Duplicate
  and reversed samples are ignored without replacing the accepted timestamp cursor and make a
  numeric result partial. The final sample receives no extrapolated time.
- **Pauses, gaps, and missing values:** `included: false` is known pause/rest and is excluded from
  both contributing and eligible duration. Otherwise missing/invalid HR excludes that exact
  interval and remains in eligible duration. Otherwise an interval at or below the configured gap
  bound contributes; a longer interval is wholly excluded as a gap and remains eligible unknown
  time. This precedence allows a long explicit pause to remain known rest.
- **Coverage:** `sourceTimeCoverage = coverageSeconds / eligibleDurationSeconds`, where eligible
  duration is contributing + missing + invalid + gap duration and excludes pause. Zone duration has
  no quality projection across excluded time.
- **Zones:** with qualified LTHR, ratios use half-open upper boundaries: zone 1 `<81%`, zone 2
  `[81%,90%)`, zone 3 `[90%,94%)`, zone 4 `[94%,100%)`, and zone 5 `>=100%`. Missing or invalid LTHR
  makes zones explicitly unavailable while preserving the independent HR evidence.
- **Statuses and minimum evidence:** one positive qualified interval is the minimum numeric zone
  evidence. Complete eligible coverage with no ordering anomaly is `available`; retained numeric
  evidence with a dropout, gap, missing interval, duplicate, reversal, or invalid timestamp is
  `partial/source_incomplete`; no samples or no qualified interval is `unavailable` with
  `zoneSeconds: null`, never five false zeros.
- **Live adapter boundary:** the mobile recorder feeds this same accumulator and exposes its
  versioned evidence in the provisional snapshot. A buffered HR reading older than the five-second
  accepted-gap policy is passed as missing rather than extended. Unit parity covers this adapter;
  it does not claim device/BLE runtime delivery or make legacy presentation counters authoritative.
- **Rounding:** duration, average, and coverage calculations retain full precision. Presentation may
  round only after status and diagnostics are retained.
