# Heart-rate Common Load specification

**Model:** `gradientpeak_relative_load`
**Model version:** `1`
**Method:** `heart_rate_zones`
**Calculation version:** `heart-rate-common-load-v1`
**Minimum contributing duration:** 30 seconds
**Minimum source-time coverage:** 0.8

- **Inputs and units:** versioned HR duration evidence, its known eligible active duration in
  seconds, and a current category-specific LTHR in beats per minute with complete evidence
  provenance. The accepted LTHR range is the existing local 80–220 bpm contract. Zone durations
  are retained diagnostics; Load uses qualified whole-bpm evidence directly.
- **Formula:** for each qualified bucket, add
  `(seconds / 3600) * (bpm / lthrBpm)^2 * 100`. Equivalent normalized intensity is the
  duration-weighted root mean square `sqrt(load / ((contributingSeconds / 3600) * 100))`. One
  qualified active hour exactly at LTHR is intensity 1 and 100 Common Load. The formula is
  continuous across presentation-zone boundaries and is not an external provider score.
- **Pauses, gaps, missing, zero, and ordering:** the HR duration calculation owns interval
  semantics. Known pauses contribute neither duration nor Load. Gaps, missing HR, zero dropout,
  invalid HR, duplicate timestamps, and reversals are never projected or converted to zero; they
  preserve partial source diagnostics and reduce coverage as specified there.
- **Qualified evidence:** numeric Load requires at least 30 contributing seconds, coverage at or
  above 0.8, a bounded intensity no greater than the Common Load model maximum 1.5, a non-stale
  category-compatible LTHR, and complete threshold identity/fingerprint/timestamps. Missing,
  malformed, stale, truncated, or otherwise ineligible threshold evidence cannot produce Load.
- **Statuses:** complete HR evidence at full eligible-time coverage can become final `available`.
  Qualified incomplete evidence is numeric `partial/activity_data_partial` with contributing and
  eligible durations plus exact coverage. Missing HR, coverage or duration below policy, missing or
  ineligible LTHR, incompatible duration, and out-of-range intensity are explicit `unavailable`
  results with no numeric Load. Live recording authority is always provisional (`partial`) even
  when current HR evidence is complete; completed import analysis recomputes final authority.
- **Aggregation and model compatibility:** compatible model/version Loads add; any partial or
  unavailable member prevents a complete aggregate. Aggregate intensity is the duration-weighted
  root-mean-square implied by summed Load. A model/version mismatch makes arithmetic unavailable.
- **Rounding:** Common Load contracts retain full-precision `rawLoad` and raw equivalent intensity
  for model arithmetic. Convenience display fields round Load to two decimals and intensity to four
  decimals; Common Load envelopes use the full-precision values.
