# Completed-activity load calculations

`calculation-policy.ts` is the extension point for sport-specific IF/TSS method selection. Its registry uses `Record<CanonicalSport, ...>`, so adding a canonical sport without declaring a completed-activity policy fails type-checking.

## Adding an activity category

1. Add the category to the canonical sport contract and database enum through the normal migration workflow.
2. Add its curve, threshold, and ordered methods to `completedActivityCalculationPolicy`. Use only methods whose input and threshold semantics are valid for that sport; an empty policy is preferable to a fabricated score.
3. Add any new active method to `activityTssMethodValues`, add it to the append-only identity compatibility structures, pair it with a calibration in `activityTssIdentitySchema`, then implement it in `resolveTssMethod`. Removing a method from the active policy must not invalidate historical identities.
4. Define ingestion and effort eligibility for the category. Do not cast arbitrary provider values into the canonical category type.
5. Add a behavior test for primary data, sport-specific and generic LTHR fallback, missing evidence, and incompatible data rejection.
6. Update API and UI availability reasons so users can see what evidence is missing.

Power, pace, swim pace, and heart-rate calculations retain different method identities. They must not be silently combined into one historical load series when their sport, method, version, or calibration differs.

Current heart-rate stress uses average heart rate relative to sport-compatible LTHR. `lthr_by_sport` takes precedence over generic `lthr`; historical heart-rate-reserve identities remain parseable but are not selectable by the active policy. Available stress results always carry a current `method`, while unavailable results carry exactly one `unavailable_reason`.

## Stream heart-rate load

Stream HR Load is a separate diagnostic and does not replace the canonical summary load above. Version `lthr_normalized_squared_v1` integrates each accepted interval as `100 * interval_hours * (min(HR, 250 bpm) / LTHR)^2`. It is continuous across zone boundaries and yields exactly 100 load for one hour at LTHR. The 250 bpm plausible-heart-rate cap prevents isolated implausible samples from dominating the result. Existing stream timestamp, dropout, gap, and minimum-coverage rules determine which intervals are accepted; LTHR zone distribution remains a separate presentation.
