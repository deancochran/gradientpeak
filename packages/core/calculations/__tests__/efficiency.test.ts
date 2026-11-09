import { describe, expect, it } from "vitest";

import {
  AEROBIC_DECOUPLING_CALCULATION_VERSION,
  AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
  type AerobicAnalysisInput,
  type AerobicAnalysisSample,
  aerobicDecouplingResultSchema,
  calculateAerobicDecoupling,
  calculateEfficiencyFactor,
  createAerobicAnalysisAccumulator,
  efficiencyFactorResultSchema,
} from "../efficiency";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/aerobic-numerical-trust-v1";
import { calculateReferenceAerobicAnalysis } from "./support/aerobic-analysis-reference";

type AerobicIdentity = Pick<AerobicAnalysisInput, "modality" | "outputUnit">;

function fiveSecondSamples(
  durationSeconds: number,
  valuesAt: (timestampSeconds: number) => Omit<AerobicAnalysisSample, "timestampSeconds">,
): AerobicAnalysisSample[] {
  return Array.from({ length: durationSeconds / 5 + 1 }, (_, index) => {
    const timestampSeconds = index * 5;
    return { timestampSeconds, ...valuesAt(timestampSeconds) };
  });
}

function batchResults(identity: AerobicIdentity, samples: readonly AerobicAnalysisSample[]) {
  const input = { ...identity, samples };
  return {
    efficiencyFactorResult: calculateEfficiencyFactor(input),
    aerobicDecouplingResult: calculateAerobicDecoupling(input),
  };
}

function resultsAtTimestamp(
  identity: AerobicIdentity,
  samples: readonly AerobicAnalysisSample[],
  timestampSeconds: number,
) {
  const index = samples.findIndex((sample) => sample.timestampSeconds === timestampSeconds);
  if (index < 0) throw new Error(`Missing aerobic prefix timestamp ${timestampSeconds}`);
  return batchResults(identity, samples.slice(0, index + 1));
}

function expectEveryPrefixToMatchBatch(input: {
  name: string;
  identity: AerobicIdentity;
  samples: readonly AerobicAnalysisSample[];
}) {
  const accumulator = createAerobicAnalysisAccumulator(input.identity);
  const prefix: AerobicAnalysisSample[] = [];
  for (const [index, sample] of input.samples.entries()) {
    prefix.push(sample);
    accumulator.addSample(sample);
    expect({
      case: input.name,
      prefixLength: index + 1,
      timestampSeconds: sample.timestampSeconds,
      result: accumulator.getResult(),
    }).toEqual({
      case: input.name,
      prefixLength: index + 1,
      timestampSeconds: sample.timestampSeconds,
      result: batchResults(input.identity, prefix),
    });
  }
}

const cyclingIdentity = { modality: "cycling", outputUnit: "watts" } as const;
const runningIdentity = {
  modality: "running",
  outputUnit: "meters_per_second",
} as const;

const qualificationBoundarySamples = fiveSecondSamples(1_200, (timestampSeconds) => ({
  output: 200,
  heartRateBpm: timestampSeconds <= 600 ? 140 : 150,
}));

const coverageTransitionSamples = fiveSecondSamples(1_260, (timestampSeconds) => ({
  output: 200,
  heartRateBpm: timestampSeconds <= 60 ? null : 145,
}));

const coefficientOfVariationTransitionSamples = fiveSecondSamples(1_200, (timestampSeconds) => ({
  output: timestampSeconds > 600 && timestampSeconds <= 610 ? 400 : 200,
  heartRateBpm: 145,
}));

const pauseAndGapSamples: AerobicAnalysisSample[] = [
  ...fiveSecondSamples(300, () => ({ output: 200, heartRateBpm: 145 })),
  { timestampSeconds: 306, output: 200, heartRateBpm: 145 },
  ...Array.from({ length: 200 }, (_, index) => {
    const timestampSeconds = 311 + index * 5;
    return {
      timestampSeconds,
      output: 200,
      heartRateBpm: 145,
      ...(timestampSeconds === 616 ? { included: false } : {}),
    };
  }),
];

const missingEvidenceSamples = fiveSecondSamples(1_300, (timestampSeconds) => ({
  output: timestampSeconds > 200 && timestampSeconds <= 250 ? null : 200,
  heartRateBpm: timestampSeconds > 400 && timestampSeconds <= 450 ? null : 145,
}));

const timestampOrderingSamples = fiveSecondSamples(1_200, () => ({
  output: 4,
  heartRateBpm: 145,
})).flatMap((sample) =>
  sample.timestampSeconds === 100
    ? [sample, { ...sample, output: 8 }, { ...sample, timestampSeconds: 95, heartRateBpm: 200 }]
    : [sample],
);

function expectNumericEfficiency(input: Parameters<typeof calculateEfficiencyFactor>[0]) {
  const result = calculateEfficiencyFactor(input);
  expect(result.status).not.toBe("unavailable");
  if (result.status === "unavailable") throw new Error(`Expected numeric EF: ${result.reason}`);
  return result;
}

function expectNumericDecoupling(input: Parameters<typeof calculateAerobicDecoupling>[0]) {
  const result = calculateAerobicDecoupling(input);
  expect(result.status).not.toBe("unavailable");
  if (result.status === "unavailable") {
    throw new Error(`Expected numeric decoupling: ${result.reason}`);
  }
  return result;
}

describe("aerobic Efficiency Factor v1", () => {
  it("matches the literal 200 W and 140/150 bpm hand calculation", () => {
    const fixture = fixtures.knownCyclingDrift;
    const reference = calculateReferenceAerobicAnalysis({ samples: fixture.input.samples });
    const result = expectNumericEfficiency(fixture.input);

    expect(result).toMatchObject({
      status: "available",
      calculationVersion: AEROBIC_EFFICIENCY_FACTOR_CALCULATION_VERSION,
      modality: "cycling",
      outputUnit: "watts",
      unit: "watts_per_bpm",
      diagnostics: {
        contributingDurationSeconds: fixture.expected.contributingDurationSeconds,
        averageOutput: fixture.expected.averageOutput,
        averageHeartRateBpm: fixture.expected.averageHeartRateBpm,
        outputCoverage: 1,
        heartRateCoverage: 1,
        pairedCoverage: 1,
        qualification: { qualified: true },
      },
    });
    expect(result.value).toBeCloseTo(fixture.expected.efficiencyFactor, 12);
    expect(result.value).toBeCloseTo(reference.efficiency?.efficiencyFactor ?? Number.NaN, 12);
    expect(efficiencyFactorResultSchema.safeParse(result).success).toBe(true);
  });

  it("keeps running m/s per bpm separate from cycling W per bpm", () => {
    const fixture = fixtures.knownRunningDrift;
    const result = expectNumericEfficiency(fixture.input);

    expect(result).toMatchObject({
      status: "available",
      modality: "running",
      outputUnit: "meters_per_second",
      unit: "meters_per_second_per_bpm",
    });
    expect(result.value).toBeCloseTo(fixture.expected.efficiencyFactor, 12);
  });

  it("returns diagnostic unavailable outcomes instead of zero fallbacks", () => {
    const cases = [
      fixtures.insufficientEfficiencyDuration,
      fixtures.missingHeartRate,
      fixtures.zeroHeartRate,
      fixtures.zeroOutput,
      fixtures.unsteadyEffort,
      fixtures.modalityMismatch,
      fixtures.unsupportedModality,
    ];
    for (const fixture of cases) {
      const result = calculateEfficiencyFactor(fixture.input);
      expect(result).toMatchObject({
        status: "unavailable",
        value: null,
        reason: fixture.expected.reason,
      });
      expect(efficiencyFactorResultSchema.safeParse(result).success).toBe(true);
    }
  });

  it("returns unavailable invalid input with bounded diagnostics", () => {
    const result = calculateEfficiencyFactor({
      modality: "cycling",
      outputUnit: "watts",
      samples: [
        { timestampSeconds: 0, output: 200, heartRateBpm: 140 },
        { timestampSeconds: 1, output: Number.NaN, heartRateBpm: 140 },
      ],
    });

    expect(result).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "invalid_input",
      diagnostics: { sampleCount: 2, contributingDurationSeconds: 0 },
    });
  });
});

describe("aerobic decoupling v1", () => {
  it("uses timestamp-weighted equal contributing-time halves for the hand calculation", () => {
    const fixture = fixtures.knownCyclingDrift;
    const reference = calculateReferenceAerobicAnalysis({ samples: fixture.input.samples });
    const result = expectNumericDecoupling(fixture.input);

    expect(result).toMatchObject({
      status: "available",
      calculationVersion: AEROBIC_DECOUPLING_CALCULATION_VERSION,
      modality: "cycling",
      outputUnit: "watts",
      efficiencyFactorUnit: "watts_per_bpm",
      unit: "ratio",
      diagnostics: {
        targetHalfDurationSeconds: 600,
        firstHalf: {
          contributingDurationSeconds: 600,
          averageOutput: 200,
          averageHeartRateBpm: 140,
        },
        secondHalf: {
          contributingDurationSeconds: 600,
          averageOutput: 200,
          averageHeartRateBpm: 150,
        },
      },
    });
    expect(result.diagnostics.firstHalf?.efficiencyFactor).toBeCloseTo(
      fixture.expected.firstHalfEfficiencyFactor,
      12,
    );
    expect(result.diagnostics.secondHalf?.efficiencyFactor).toBeCloseTo(
      fixture.expected.secondHalfEfficiencyFactor,
      12,
    );
    expect(result.value).toBeCloseTo(fixture.expected.decoupling, 12);
    expect(result.value).toBeCloseTo(reference.decoupling ?? Number.NaN, 12);
    expect(aerobicDecouplingResultSchema.safeParse(result).success).toBe(true);
  });

  it("covers running independently with the running dimensional identity", () => {
    const fixture = fixtures.knownRunningDrift;
    const result = expectNumericDecoupling(fixture.input);

    expect(result).toMatchObject({
      status: "available",
      modality: "running",
      outputUnit: "meters_per_second",
      efficiencyFactorUnit: "meters_per_second_per_bpm",
      unit: "ratio",
    });
    expect(result.value).toBeCloseTo(fixture.expected.decoupling, 12);
  });

  it("preserves valid zero and negative drift", () => {
    const zero = expectNumericDecoupling(fixtures.validZeroDrift.input);
    const negative = expectNumericDecoupling(fixtures.negativeDrift.input);

    expect(zero.value).toBe(fixtures.validZeroDrift.expected.decoupling);
    expect(negative.value).toBeCloseTo(fixtures.negativeDrift.expected.decoupling, 12);
    expect(negative.value).toBeLessThan(0);
  });

  it("is invariant to equivalent sample rates and irregular timestamps", () => {
    const representations = [
      fixtures.representations.oneSecond,
      fixtures.representations.twoSecond,
      fixtures.representations.fiveSecond,
      fixtures.representations.irregular,
    ];
    for (const samples of representations) {
      const input = { modality: "cycling", outputUnit: "watts", samples } as const;
      const efficiency = expectNumericEfficiency(input);
      const decoupling = expectNumericDecoupling(input);
      const reference = calculateReferenceAerobicAnalysis({ samples });
      expect(efficiency.value).toBeCloseTo(fixtures.representations.expected.efficiencyFactor, 12);
      expect(decoupling.value).toBeCloseTo(fixtures.representations.expected.decoupling, 12);
      expect(efficiency.value).toBeCloseTo(
        reference.efficiency?.efficiencyFactor ?? Number.NaN,
        12,
      );
      expect(decoupling.value).toBeCloseTo(reference.decoupling ?? Number.NaN, 12);
    }
  });

  it("splits asymmetric source density by contributing elapsed time, not sample count", () => {
    const fixture = fixtures.asymmetricSampleDensity;
    const sampleMidpoint = Math.floor(fixture.input.samples.length / 2);
    expect(fixture.input.samples[sampleMidpoint]?.timestampSeconds).toBe(
      fixture.expected.sourceSampleMidpointTimestampSeconds,
    );

    const result = expectNumericDecoupling(fixture.input);
    expect(result.diagnostics.targetHalfDurationSeconds).toBe(
      fixture.expected.targetHalfDurationSeconds,
    );
    expect(result.diagnostics.firstHalf?.contributingDurationSeconds).toBe(
      fixture.expected.targetHalfDurationSeconds,
    );
    expect(result.diagnostics.secondHalf?.contributingDurationSeconds).toBe(
      fixture.expected.targetHalfDurationSeconds,
    );
    expect(result.value).toBeCloseTo(fixture.expected.decoupling, 12);
  });

  it("excludes and resets gaps while retaining enough qualified evidence as partial", () => {
    const fixture = fixtures.overMaximumGap;
    const result = expectNumericDecoupling(fixture.input);

    expect(result).toMatchObject({
      status: fixture.expected.status,
      reason: "source_incomplete",
      value: fixture.expected.decoupling,
      diagnostics: {
        contributingDurationSeconds: fixture.expected.contributingDurationSeconds,
        eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
        excludedGapDurationSeconds: fixture.expected.excludedGapDurationSeconds,
        pairedCoverage: fixture.expected.coverage,
        segmentCount: 2,
      },
    });
  });

  it("excludes known pauses from coverage without degrading status", () => {
    const fixture = fixtures.knownPause;
    const result = expectNumericDecoupling(fixture.input);

    expect(result).toMatchObject({
      status: fixture.expected.status,
      value: fixture.expected.decoupling,
      diagnostics: {
        contributingDurationSeconds: fixture.expected.contributingDurationSeconds,
        eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
        excludedInactiveDurationSeconds: fixture.expected.excludedInactiveDurationSeconds,
        pairedCoverage: 1,
        segmentCount: 2,
      },
    });
  });

  it("retains a qualified partial result after a bounded missing-HR interval", () => {
    const fixture = fixtures.missingHeartRateInterval;
    const result = expectNumericDecoupling(fixture.input);

    expect(result).toMatchObject({
      status: fixture.expected.status,
      reason: "source_incomplete",
      value: fixture.expected.decoupling,
      diagnostics: {
        contributingDurationSeconds: fixture.expected.contributingDurationSeconds,
        eligibleDurationSeconds: fixture.expected.eligibleDurationSeconds,
        excludedMissingHeartRateDurationSeconds:
          fixture.expected.excludedMissingHeartRateDurationSeconds,
        heartRateCoverage: fixture.expected.coverage,
      },
    });
  });

  it("rejects insufficient coverage, halves, HR, modality, and steady effort with reasons", () => {
    const cases = [
      fixtures.insufficientHeartRateCoverage,
      fixtures.insufficientDecouplingHalves,
      fixtures.missingHeartRate,
      fixtures.zeroHeartRate,
      fixtures.zeroOutput,
      fixtures.unsteadyEffort,
      fixtures.modalityMismatch,
      fixtures.unsupportedModality,
    ];
    for (const fixture of cases) {
      expect(calculateAerobicDecoupling(fixture.input)).toMatchObject({
        status: "unavailable",
        value: null,
        reason: fixture.expected.reason,
      });
    }
  });
});

describe("incremental aerobic analysis parity", () => {
  it.each([
    ["steady cycling", fixtures.knownCyclingDrift],
    ["steady running", fixtures.knownRunningDrift],
    ["missing heart rate", fixtures.missingHeartRate],
    ["known pause", fixtures.knownPause],
    ["over-gap source", fixtures.overMaximumGap],
    ["insufficient duration", fixtures.insufficientEfficiencyDuration],
    ["unsteady output", fixtures.unsteadyEffort],
  ] as const)("matches batch semantics for %s", (_name, fixture) => {
    const accumulator = createAerobicAnalysisAccumulator({
      modality: fixture.input.modality,
      outputUnit: fixture.input.outputUnit,
    });
    for (const sample of fixture.input.samples) accumulator.addSample(sample);

    const incremental = accumulator.getResult();
    expect(incremental.efficiencyFactorResult).toEqual(calculateEfficiencyFactor(fixture.input));
    expect(incremental.aerobicDecouplingResult).toEqual(calculateAerobicDecoupling(fixture.input));

    accumulator.reset();
    expect(accumulator.getResult()).toMatchObject({
      efficiencyFactorResult: { status: "unavailable", reason: "no_samples", value: null },
      aerobicDecouplingResult: { status: "unavailable", reason: "no_samples", value: null },
    });
  });
});

describe("prefix-by-prefix live aerobic parity", () => {
  it.each([
    {
      name: "600/1200 second qualification boundaries",
      identity: cyclingIdentity,
      samples: qualificationBoundarySamples,
    },
    {
      name: "coverage qualification transitions",
      identity: cyclingIdentity,
      samples: coverageTransitionSamples,
    },
    {
      name: "output coefficient-of-variation transitions",
      identity: cyclingIdentity,
      samples: coefficientOfVariationTransitionSamples,
    },
    {
      name: "known pauses and over-maximum gaps",
      identity: cyclingIdentity,
      samples: pauseAndGapSamples,
    },
    {
      name: "missing output and heart-rate evidence",
      identity: cyclingIdentity,
      samples: missingEvidenceSamples,
    },
    {
      name: "duplicate and reversed running timestamps",
      identity: runningIdentity,
      samples: timestampOrderingSamples,
    },
  ])("matches the batch calculation at every $name prefix", (input) => {
    expectEveryPrefixToMatchBatch(input);
  });

  it("crosses the exact Efficiency Factor and decoupling duration boundaries", () => {
    expect(
      resultsAtTimestamp(cyclingIdentity, qualificationBoundarySamples, 595).efficiencyFactorResult,
    ).toMatchObject({ status: "unavailable", reason: "insufficient_duration" });
    expect(
      resultsAtTimestamp(cyclingIdentity, qualificationBoundarySamples, 600).efficiencyFactorResult,
    ).toMatchObject({
      status: "available",
      diagnostics: {
        contributingDurationSeconds: 600,
        qualification: { durationQualified: true },
      },
    });
    expect(
      resultsAtTimestamp(cyclingIdentity, qualificationBoundarySamples, 1_195)
        .aerobicDecouplingResult,
    ).toMatchObject({ status: "unavailable", reason: "insufficient_half_duration" });
    expect(
      resultsAtTimestamp(cyclingIdentity, qualificationBoundarySamples, 1_200)
        .aerobicDecouplingResult,
    ).toMatchObject({
      status: "available",
      diagnostics: {
        contributingDurationSeconds: 1_200,
        firstHalf: { contributingDurationSeconds: 600 },
        secondHalf: { contributingDurationSeconds: 600 },
      },
    });
  });

  it("preserves coverage and coefficient-of-variation qualification transitions", () => {
    const coverageBefore = resultsAtTimestamp(cyclingIdentity, coverageTransitionSamples, 595);
    const coverageBoundary = resultsAtTimestamp(cyclingIdentity, coverageTransitionSamples, 600);
    const coveredDurationBoundary = resultsAtTimestamp(
      cyclingIdentity,
      coverageTransitionSamples,
      660,
    );
    expect(
      coverageBefore.efficiencyFactorResult.diagnostics.qualification.heartRateCoverageQualified,
    ).toBe(false);
    expect(coverageBoundary.efficiencyFactorResult.diagnostics).toMatchObject({
      heartRateCoverage: 0.9,
      pairedCoverage: 0.9,
      qualification: {
        heartRateCoverageQualified: true,
        pairedCoverageQualified: true,
        durationQualified: false,
      },
    });
    expect(coveredDurationBoundary.efficiencyFactorResult).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      diagnostics: { contributingDurationSeconds: 600 },
    });
    expect(
      resultsAtTimestamp(cyclingIdentity, coverageTransitionSamples, 1_260).aerobicDecouplingResult,
    ).toMatchObject({ status: "partial", reason: "source_incomplete" });

    expect(
      resultsAtTimestamp(cyclingIdentity, coefficientOfVariationTransitionSamples, 600)
        .efficiencyFactorResult,
    ).toMatchObject({ status: "available" });
    expect(
      resultsAtTimestamp(cyclingIdentity, coefficientOfVariationTransitionSamples, 610)
        .efficiencyFactorResult,
    ).toMatchObject({ status: "unavailable", reason: "unsteady_effort" });
    const recoveredWholeEffort = resultsAtTimestamp(
      cyclingIdentity,
      coefficientOfVariationTransitionSamples,
      1_200,
    );
    expect(recoveredWholeEffort.efficiencyFactorResult).toMatchObject({ status: "available" });
    expect(recoveredWholeEffort.aerobicDecouplingResult).toMatchObject({
      status: "unavailable",
      reason: "unsteady_effort",
    });
  });

  it("retains pause, gap, missing-value, and timestamp-ordering diagnostics", () => {
    const pauseAndGap = batchResults(cyclingIdentity, pauseAndGapSamples);
    expect(pauseAndGap.efficiencyFactorResult).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      diagnostics: {
        excludedGapDurationSeconds: 6,
        excludedInactiveDurationSeconds: 5,
        segmentCount: 3,
      },
    });

    const missing = batchResults(cyclingIdentity, missingEvidenceSamples);
    expect(missing.efficiencyFactorResult).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      diagnostics: {
        contributingDurationSeconds: 1_200,
        excludedMissingOutputDurationSeconds: 50,
        excludedMissingHeartRateDurationSeconds: 50,
      },
    });

    const ordering = batchResults(runningIdentity, timestampOrderingSamples);
    expect(ordering.efficiencyFactorResult).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
      diagnostics: {
        duplicateTimestampCount: 1,
        reversedTimestampCount: 1,
      },
    });
    expect(ordering.aerobicDecouplingResult).toMatchObject({
      status: "partial",
      reason: "source_incomplete",
    });
  });
});
