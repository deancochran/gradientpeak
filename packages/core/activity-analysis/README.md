# Completed-activity load calculations

`calculation-policy.ts` is the extension point for activity-category-specific Common Load evidence selection. Its registry uses `Record<CanonicalActivityCategory, ...>`, so adding a canonical activity category without declaring a completed-activity policy fails type-checking.

## Adding an activity category

1. Add the category to the canonical activity-category contract and database enum through the normal migration workflow.
2. Add its curve, threshold, and ordered evidence methods to `completedActivityCalculationPolicy`. Use only methods whose input and threshold semantics are valid for that activity category; an empty policy is preferable to a fabricated load.
3. Add any new direct method to `activityThresholdMethodValues`, pair it with the matching `CommonThresholdEvidence`, then implement it in `resolveCommonLoadMethod`.
4. Define ingestion and effort eligibility for the category. Do not cast arbitrary provider values into the canonical category type.
5. Add a behavior test for primary data, activity-category-specific and generic LTHR fallback, missing evidence, and incompatible data rejection.
6. Update API and UI availability reasons so users can see what evidence is missing.

Common Load is the sole calibration-dependent stress result. Its strict result contract carries availability, method, intensity, calibration evidence, and quality; unavailable results retain their reason and any valid attempted-method evidence.

`lthr_by_activity_category` takes precedence over generic `lthr`. Direct threshold evidence is preferred when eligible; otherwise the heart-rate-zone adapter may produce Common Load from sufficient stream coverage. Training effect is derived only from the intensity of available or partial Common Load.

## Stream heart-rate load

Stream HR Load is a separate diagnostic and does not replace the canonical summary load above. Version `lthr_normalized_squared_v1` integrates each accepted interval as `100 * interval_hours * (HR / LTHR)^2`. It is continuous across zone boundaries and yields exactly 100 load for one hour at LTHR. Values outside the local 30–250 bpm qualified range are excluded rather than capped or projected. Existing stream timestamp, dropout, gap, and minimum-coverage rules determine which intervals are accepted; LTHR zone distribution remains a separate presentation.
