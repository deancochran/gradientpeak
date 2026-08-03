# Swimming duration-performance v1

**Model:** `swimming-duration-performance-v1`
**Input:** `swimming-duration-performance-input-v1`
**Evidence policy:** `swimming-duration-performance-evidence-v1`

## Environment and timing separation

Swimming duration evidence is canonical speed in metres per second with explicit `pool` or
`open_water` environment. Pool evidence requires pool-length identity and
`pool_length_timing`; open-water evidence requires no pool length and
`open_water_continuous_timing`. Fresh evidence from both environments is incompatible and causes
model-wide abstention. No pool/open-water normalization is attempted.

The pace-duration curve applies the shared exact-duration selection, recency, coverage,
monotonicity, outlier, confidence, and identity rules. Pace is `100 / speed` seconds per 100 m.
Pool anchors are 30, 60, 120, 300, 600, 1,200, and 1,800 seconds. Open-water anchors are 600,
1,200, 1,800, and 3,600 seconds.

## CSS and capacity claims

CSS is available only from one qualified pool `css_400m_200m` protocol with distinct exact 400 m
and 200 m timed segments. The model invokes the existing versioned CSS calculation:

```text
cssSecondsPer100m = (time400Seconds - time200Seconds) / 2
cssMetersPerSecond = 100 / cssSecondsPer100m
```

The canonical protocol carries one activity-scoped protocol identity, protocol observation and
content-evidence identities, accepted evidence/segment revision, current source artifact ID and
digest, pool length, `pool_length_timing`, and complete ordered source-effort observations. Its
status is `qualified` with no reasons. Persistence retains those source facts only; CSS scalar
results remain derived model output. A changed current artifact or segment revision invalidates the
old protocol rather than allowing its prior result to remain authoritative.

Open-water duration evidence does not become CSS. Pool sprint capacity requires exact complete 30
and 60-second pool-timed points. Open-water sprint capacity is unavailable because this version does
not treat continuous open-water timing as sprint-grade evidence.

Pool aerobic capacity requires available CSS plus exact complete 1,800-second pool evidence.
Open-water aerobic capacity instead requires exact 600, 1,200, and 1,800-second continuous-timing
points from at least two winning activities. The two concepts remain differently named and sourced.

## Repeated-effort decay

Repeated-effort decay is published only from a qualified fixed-distance maximal-repeatability
protocol with at least three ordered bouts and exact recovery timing between every adjacent bout.
V1 activates this only for pool evidence. The first bout must be the fastest; otherwise the model
abstains rather than relabeling a warm-up or pacing pattern as decay.

```text
speed[i] = fixedDistance / activeDuration[i]
finalRetention = finalSpeed / firstSpeed
maximumLoss = 1 - minimumSpeed / firstSpeed
```

The result is protocol-specific decay, not general recovery capacity. Without repetitions and
recovery evidence the value and repeated-effort level are explicitly unavailable. CSS, sprint,
aerobic, and repeated-effort levels likewise require their exact capability to be available.
