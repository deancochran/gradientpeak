# Cycling duration-performance kernel v1

**Model version:** `cycling-duration-performance-v1`
**Input contract:** `cycling-duration-performance-input-v1`
**Evidence policy:** `cycling-duration-performance-evidence-v1`

## Claim boundary

This is a deterministic software model of qualified cycling power-duration evidence. It is not a
physiology, laboratory, medical, race-outcome, or training-response validation. In particular:

- `pmax` is the canonical five-second maximal-mean-power proxy, not instantaneous muscle power;
- Critical Power is the intercept of this implementation's bounded two-parameter fit;
- **GradientPeak reserve** is the fit's work term in joules. It is not asserted to be a direct
  measurement of physiological W′;
- modeled threshold is a GradientPeak planning anchor, not FTP or lactate threshold;
- modeled TTE is a model intersection, not an observed exhaustion test; and
- durability is cross-duration retention between 20 and 60 minutes, not late-ride fatigue
  resistance.

No phenotype label is emitted or accepted as a planning input.

## Evidence boundary and bounded work

The only numeric source is an already-extracted canonical cycling best effort with:

- bike/power/watts identity;
- separate observation/evidence/revision identity;
- `source=imported`, `method=activity_file_best_effort`, and
  `calculationVersion=best-effort-extraction-v1`;
- exact activity and segment IDs;
- one athlete ID shared by the input, every effort, the model identity, and capability profile;
- exact window offsets, complete contributing duration, and `windowCoverage=1`; and
- canonical extraction status, reason, source-time coverage, and calculation identity.

Raw samples are not part of the contract and the kernel never extracts or recalculates a raw
effort. Input is capped at 2,000 efforts and 14,400 seconds per effort. A complete bounded read is
required before any maximal claim. A truncated read makes every maximal-derived result unavailable.
The shared `duration-performance-foundation-v1` now owns this exact-window, recency, deterministic
selection, coverage, monotonicity, inverse-duration fit, confidence, and change-identity behavior;
cycling retains only power-specific interpretation and policy names.

Evidence is eligible through exactly 90 days after `recordedAt`; the lower cutoff is inclusive.
Future evidence is excluded. A canonical `partial` numeric window remains eligible only when wider
source-time coverage is at least 0.8, and it propagates a partial result. Duration-aware plausibility
review uses Core's canonical activity-effort policy; review or invalid observations are excluded,
not clamped.

## Maximal-mean power curve

For each exact duration, the strongest eligible effort wins. A power tie is broken by newest
`recordedAt`, then lexicographically smallest evidence ID. The result retains the winning evidence,
activity, segment, extraction status, and source calculation version. Lower efforts at the same
duration remain visible as superseded source IDs.

The curve must be non-increasing as duration increases. Any increase causes abstention for the
whole kernel. V1 does not delete an alleged outlier, isotonic-fit, clamp, winsorize, or infer which
of two conflicting canonical points is correct. Full curve coverage requires exact 5, 30, 60, 300,
600, 1,200, 1,800, and 3,600-second anchors; a valid but sparse curve is `partial`.

## Pmax, Critical Power, and GradientPeak reserve

Pmax is the selected five-second curve point. It is unavailable without exact five-second evidence.

Critical Power and GradientPeak reserve use ordinary least squares on the fixed duration set
`[180, 300, 600, 900, 1200, 1800]` where evidence exists:

```text
powerWatts = criticalPowerWatts + gradientPeakReserveJoules / durationSeconds
```

Eligibility requires all of the following:

- at least four distinct fit durations;
- at least one point in each band: 180–360, 361–900, and 901–1,800 seconds;
- winning points from at least two activities;
- Critical Power in 50–1,000 W and reserve in 1,000–100,000 J;
- R² at least 0.95 and RMSE / mean observed power at most 0.05; and
- leave-one-point-out changes no greater than 0.15 for CP and 0.35 for reserve.

The regression is unweighted: one canonical point represents one duration. Performance maxima are
not recency-weighted inside the 90-day window. Newer evidence matters only on an exact power tie or
when older evidence expires. A poor or unstable fit is unavailable; v1 never removes a residual
outlier to force acceptance.

## Modeled threshold and TTE

Modeled threshold requires an accepted CP/reserve fit and exact 1,200-second evidence. Its policy is:

```text
modelPower1200 = CP + reserve / 1200
modeledThreshold = 0.95 * modelPower1200
modeledTTE = reserve / (modeledThreshold - CP)
```

Threshold must be above CP. TTE is published only in the bounded 1,200–7,200-second range. These
choices are explicit internal planning semantics, not a claim that 95% identifies an athlete's FTP
or that the resulting duration predicts observed exhaustion.

## Durability and capability profile

V1 durability is `MMP(3600) / MMP(1200)`. It requires both exact points and two winning activity
IDs for an `available` result. One-activity evidence can produce only `partial`; a missing duration
is unavailable.

The AthleteCapabilityProfile-compatible bike projection exposes:

- short-duration capacity: exact 5, 30, and 60-second MMP;
- anaerobic capacity: GradientPeak reserve;
- threshold capacity: CP, modeled threshold, and bounded modeled TTE;
- long-duration capacity: exact 3,600-second MMP;
- durability: the explicitly limited retention ratio; and
- repeated-effort recovery: unavailable in v1.

Maximal efforts contain neither a repeated-bout protocol nor recovery observations. V1 therefore
does not infer repeated-effort recovery from a power curve.

## Individualized cycling levels

Levels are emitted only when every depended-on capability is `available`; partial capability data
does not become a prescription. All current available levels are single-bout evidence envelopes,
so expected repetitions are exactly one and recovery duration is null with
`not_applicable_single_bout`. V1 does not use a generic recovery ratio.

| Level | Target and intensity | Bounded duration |
|---|---|---|
| Sprint capacity | 90–100% of five-second MMP | one 5 s effort |
| Reserve capacity | 90–100% of 60-second MMP; reserve must also be available | one 30–60 s effort |
| Threshold capacity | 95–100% of modeled threshold | one 1,200 s to `min(TTE, 3,600 s)` effort |
| Long-duration capacity | 90–100% of 3,600-second MMP | one 1,800–3,600 s effort |
| Durability capacity | 85–95% of 3,600-second MMP; durability must also be available | one 3,600 s effort |
| Repeated-effort recovery | unsupported | unavailable |

Every level carries target capability, intensity, sustainable/work/recovery duration, expected
repetitions, evidence coverage, confidence, source IDs, expiry, version, and recalculation triggers.
Recalculate on a new canonical effort, source correction, evidence expiry, or policy change.
Model identity also carries stable history-series, selected-evidence-set, and full-calculation
fingerprints so historical change is explicit without treating the fingerprint as integrity proof.

## Confidence and status

Confidence is categorical decision metadata, not a probability or confidence interval. It reflects
source completeness, anchor density, independent activity count, and fit quality. `available`
requires every declared coverage requirement; `partial` may carry a numeric value with explicit
limitations; `unavailable` has a null value, closed reason code, and no claimed confidence.

## Deliberate deferrals

Step 4 capability/limiter integration, planning orchestration, and planning UI remain outside this
kernel. A generic plugin framework, Smart Segments, compatibility aliases, provider mappings,
persistence changes, and external parity datasets are also excluded. Cycling repeated-effort
recovery remains unavailable because cycling maximal-effort windows still contain no canonical
repetition/recovery protocol evidence.
