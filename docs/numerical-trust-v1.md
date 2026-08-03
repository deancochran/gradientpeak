# Numerical Trust v1

Status: INTERNAL correctness contract
Specification version: `numerical-trust-v1`
Canonical verification: `pnpm test:numerical-trust`

## Purpose and claim boundary

Numerical Trust v1 defines deterministic evidence for the calculations that summarize cycling,
running, swimming, and heart-rate activity data. It establishes that versioned production
calculations match literal vectors or independently implemented test references, that import and
live paths agree, and that result evidence survives product boundaries.

Passing this contract is an internal software-correctness claim. It is not physiological,
clinical, device, lab, race-outcome, or third-party-platform validation.

## Shared evidence policy

- The current observation describes `(previous timestamp, current timestamp]`.
- Source values remain full precision. Rounding belongs only to presentation.
- A timestamp interval of at most five seconds contributes; a longer interval is excluded as a
  gap and resets rolling or aerobic segment state.
- Known inactive time is excluded from eligible coverage and resets segment state. Missing values
  are not converted to zero. A measured zero remains distinct from missing evidence.
- Duplicate or reversed timestamps are ignored, recorded in diagnostics, and make otherwise
  numeric source evidence partial.
- Numeric results are `available` with complete source evidence and `partial` with a
  `source_incomplete` reason. An unqualified result is `unavailable`, retains a specific reason
  and diagnostics, and has a null numeric value.
- Every structured result carries its calculation or policy version. Structured results are the
  sole numerical evidence contract; duplicate scalar compatibility fields are prohibited.

## Version registry

| Domain | Production/policy versions | Fixture version | Independent reference version |
|---|---|---|---|
| Cycling | `cycling-normalized-power-v1`, Common Load `1` | `cycling-numerical-trust-fixtures-v1` | `direct-one-second-resampling-reference-v1` |
| Running | `running-normalized-graded-pace-v1`, Common Load `1` | `running-numerical-trust-fixtures-v1` | `direct-running-ngp-reference-v1` |
| Aerobic | `aerobic-efficiency-factor-v1`, `aerobic-decoupling-v1`, `aerobic-analysis-qualification-v1` | `aerobic-numerical-trust-fixtures-v1` | `direct-duration-weighted-aerobic-reference-v1` |
| Swimming and HR | `critical-swim-speed-400m-200m-v1`, `swim-active-rest-duration-v1`, `heart-rate-zone-duration-v1`, `heart-rate-common-load-v1` | `swimming-heart-rate-numerical-trust-fixtures-v1` | `independent-swimming-heart-rate-reference-v1` |
| Segment propagation | segment summary schema `1` | deterministic in-suite fixtures | exact structural comparison |

Changing an equation, qualification boundary, interval convention, status meaning, or diagnostic
meaning requires a new production/policy version and updated fixtures. Correcting or expanding a
test oracle without changing product semantics requires a new fixture/reference version when old
expected values would change. New edge vectors that preserve existing expected values may remain
within v1.

## Calculation contracts

### Cycling Normalized Power and Common Load

Cycling NP uses complete 30-second rolling, duration-weighted power windows and returns the fourth
root of the mean fourth power of those window values. Twenty-nine contributing seconds are
insufficient; exactly thirty produce one normalized observation. Constant power is invariant
across supported source sample rates. Common Load uses active contributing duration and normalized
intensity; one active hour at threshold is 100 Load.

Required vectors include constant and variable power, one/two/five-second and irregular source
rates, the exact 30-second boundary, exactly-five and over-five-second gaps, pauses, missing power,
zero-power coasting, and invalid timestamp ordering.

### Running NGP and Common Load

Running NGP derives interval grade from aligned speed/elevation, bounds grade to `[-0.45, 0.45]`,
applies the v1 grade-cost polynomial and bounded cost ratio, then applies the same complete
30-second fourth-power normalization. Common Load uses active duration and normalized graded
intensity; one active hour at threshold pace is 100 Load.

Required vectors include flat, ascent, descent, source-rate invariance, the exact 30-second
boundary, gaps, pauses, missing or misaligned elevation, measured zero speed, and timestamp
ordering.

### Aerobic efficiency and decoupling

Efficiency Factor is duration-weighted mean output divided by duration-weighted mean heart rate.
Cycling uses watts per bpm; running uses metres per second per bpm. Decoupling splits accepted
paired duration—not sample count or wall-clock span—into equal halves and computes
`(first-half EF - second-half EF) / first-half EF`.

Qualification requires:

- at least 600 contributing seconds for Efficiency Factor;
- at least 1,200 contributing seconds and 600 seconds in each half for decoupling;
- at least 90% output, HR, and paired eligible-time coverage; and
- output coefficient of variation no greater than 0.1.

Required vectors cover cycling/running, stable and known positive/negative/zero drift, asymmetric
sample density, equivalent source rates, gaps, pauses, missing/zero HR, missing output,
insufficient duration or coverage, unsteady output, and unsupported modality/unit combinations.
The incremental live accumulator must match the final batch calculation for every tested prefix
and final import result.

### Heart-rate duration, zones, and Common Load

Heart rate is duration-weighted using the shared interval convention. Qualified HR is 30–250 bpm;
missing and invalid values are excluded, not interpreted as rest. BPM buckets are rounded to the
nearest integer. LTHR zone upper boundaries are `[81%, 90%, 94%, 100%, infinity)` with half-open
lower zones. HR Common Load sums
`(bucket seconds / 3600) * (bucket bpm / LTHR)^2 * 100`; one qualified hour at LTHR is 100 Load.

The numerical suite covers irregular intervals, exact and excessive gaps, pauses, missing/zero HR,
minimum duration, low coverage, zone boundaries, timestamp ordering, and deterministic seeded
properties. HR-derived Load requires at least thirty contributing seconds and sufficient coverage;
unqualified duration evidence remains visible rather than becoming zero Load.

### Critical Swim Speed and pool timing

For qualified 400 m and 200 m tests, CSS pace is
`(time400Seconds - time200Seconds) / 2` seconds per 100 m and CSS speed is
`100 / cssSecondsPer100m`. Invalid, incomplete, or implausible tests abstain.

Pool timing adds active length timer time (falling back to elapsed time) and rest/idle elapsed time
(falling back to timer time). Complete known timing equal to session elapsed time is available;
missing length timing is partial; known timing exceeding elapsed time is unavailable. Threshold
swim Load uses active, not rest, duration.

## Tolerances

Tolerances compare full-precision production output with literal fixtures or independent test-only
references. They are not UI rounding rules.

| Domain | Quantity | Absolute tolerance |
|---|---|---:|
| Cycling | NP watts / Common Load | `1e-10` |
| Cycling | normalized intensity | `1e-12` |
| Cycling | duration / distance | `1e-9 s` / `1e-9 m` |
| Running | NGP speed / Common Load | `1e-10 m/s` / `1e-10` |
| Running | normalized intensity | `1e-12` |
| Running | duration / distance | `1e-9 s` / `1e-8 m` |
| Aerobic | EF / decoupling / coverage | `1e-12` |
| Aerobic | duration | `1e-9 s` |
| Swimming and HR | duration / intensity / Common Load | `1e-12` |
| CSS canonical and contract fields | literal/reference identity | exact |

Available/partial/unavailable status, reason, unit, version, qualification flags, gap accounting,
and scalar/result invariants compare exactly.

## Oracle and parity independence

- Literal canonical fixtures record hand-checkable equations and edge boundaries.
- Test-only cycling, running, aerobic, swimming, and HR references are clarity-first
  implementations. They do not import the corresponding production calculator, schema, or policy
  constants.
- Seeded property suites use recorded seed versions and values, so failures reproduce exactly:
  cycling `0x5eed2026`, running `0x2eed2026`, aerobic `0xae30b1c0`, and swimming/HR `0x5eed5005`.
- Import/live parity compares separately owned ingestion and incremental recording paths against
  the same versioned fixtures. Parity proves path agreement; the independent references provide
  the separate equation oracle.

## Contract propagation

Normalized Power's structured result is the canonical evidence. Completed segment summaries must
carry it even when the result is unavailable, while processing and failed segment analysis states
carry `summary: null`. Tests require status, unavailable
reason, source-time coverage, excluded-gap duration, and calculation version to survive:

1. stream derivation and segment summary validation;
2. controlled persistence serialization;
3. domain parsing and typed API projection; and
4. shared web/mobile presentation.

The controlled persistence test proves the application/repository boundary but does not claim a
live PostgreSQL round trip. UI tests prove presentation mapping in the configured test runtime,
not browser or device rendering.

## Canonical suite

Run from the repository root:

```sh
pnpm test:numerical-trust
```

The command runs Core canonical/reference/property calculations, recording accumulation and
segment contract checks; API import/live parity and propagation boundaries; mobile live metrics;
and shared UI evidence presentation. It is deterministic and requires no network, credentials,
database, browser, or device.

## Explicit exclusions

Numerical Trust v1 does not include:

- real athlete, customer, or production data;
- external FIT/device corpora or comparisons with vendor platform outputs;
- lab calibration, physiological validity, training-response prediction, or medical claims;
- live database/RLS behavior, browser/device journeys, BLE/GPS lifecycle, or production telemetry;
- performance, memory, battery, concurrency, or scale benchmarking; or
- backward migration/recomputation of previously stored summaries.

Those require separately authorized evidence and must not be inferred from this static suite.
