# Strength and other session-performance v1

**Model:** `strength-other-performance-v1`
**Input:** `strength-other-performance-input-v1`
**Evidence policy:** `strength-other-evidence-v1`

## Claim boundary

Strength and `other` do not receive a power-, pace-, or threshold-duration curve. The model consumes
qualified completed-session facts with immutable observation/evidence/revision identity, exact
activity and segment provenance, active-duration status, repetition status, and Borg CR10 session
RPE. It never infers repetitions, external resistance, duration, or RPE.

For strength sessions with repetitions and RPE:

```text
repetitionVolume = sum(completedRepetitions)
repetitionDensity = totalRepetitions / totalActiveMinutes
repetitionRpeLoad = sum(completedRepetitions * sessionRpe)
```

Repetition volume is not tonnage. Repetition-RPE points are an internal session index, not external
load, Common Load, threshold, or power. Density additionally requires active-duration evidence;
partial timing yields a partial value with an explicit reason. If any eligible source session omits
the required repetition or timing fact, the corresponding aggregate is partial and retains every
causal source ID rather than presenting a complete subset as the whole history.

When no usable repetition evidence exists, strength may use the same general fallback as `other`:

```text
durationRpeLoad = sum(activeDurationMinutes * sessionRpe)
```

The fallback has distinct `minute_rpe_points` units and is never summed with
`repetition_rpe_points`. For `other`, strength volume/density/repetition-load outcomes are explicitly
unavailable as not applicable.

## Protocol repeatability

Strength repeatability requires at least three ordered sets at one identified exercise and fixed
bodyweight or external resistance, with exact recovery timing between sets. The first set must have
the greatest repetition count. The output retains the exact resistance identity and reports final
repetition retention and RPE drift at that specific protocol, not general recovery capacity.

`other` repeatability requires an explicit fixed-duration/work-identity protocol, complete authored
duration for every bout, and exact recovery timing. It reports only RPE drift at fixed work duration;
it does not manufacture a performance value.

Without protocol evidence, repeatability is unavailable. Truncated reads, no fresh evidence, or
mixed strength/other categories abstain for every result. Recency, source IDs, expiry, categorical
confidence, and history/evidence/calculation fingerprints follow the shared foundation semantics.

## Deliberate deferral

Step 4 capability/limiter integration, planning orchestration, and planning UI are not part of this
model. So are a generic plugin framework, Smart Segments, provider mappings, persistence changes,
compatibility aliases, and external parity datasets.
