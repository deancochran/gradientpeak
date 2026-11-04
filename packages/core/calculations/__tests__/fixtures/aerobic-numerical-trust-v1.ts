import type { ReferenceAerobicAnalysisSample } from "../support/aerobic-analysis-reference";

function twoHalfSamples(input: {
  durationSeconds?: number;
  outputFirst: number;
  outputSecond: number;
  heartRateFirst: number;
  heartRateSecond: number;
  intervalSeconds?: number;
}): ReferenceAerobicAnalysisSample[] {
  const durationSeconds = input.durationSeconds ?? 1_200;
  const intervalSeconds = input.intervalSeconds ?? 1;
  const halfDurationSeconds = durationSeconds / 2;
  const samples: ReferenceAerobicAnalysisSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    const firstHalf = timestampSeconds <= halfDurationSeconds;
    samples.push({
      timestampSeconds,
      output: firstHalf ? input.outputFirst : input.outputSecond,
      heartRateBpm: firstHalf ? input.heartRateFirst : input.heartRateSecond,
    });
  }
  return samples;
}

function constantSamples(
  durationSeconds: number,
  output: number,
  heartRateBpm: number | null,
): ReferenceAerobicAnalysisSample[] {
  return Array.from({ length: durationSeconds + 1 }, (_, timestampSeconds) => ({
    timestampSeconds,
    output,
    heartRateBpm,
  }));
}

function samplesAtTimestamps(
  timestampsSeconds: readonly number[],
): ReferenceAerobicAnalysisSample[] {
  return timestampsSeconds.map((timestampSeconds) => ({
    timestampSeconds,
    output: 200,
    heartRateBpm: timestampSeconds <= 600 ? 140 : 150,
  }));
}

function irregularTimestamps(): number[] {
  const timestampsSeconds = [0];
  const steps = [3, 5, 2, 4, 1];
  let timestampSeconds = 0;
  let stepIndex = 0;
  while (timestampSeconds < 1_200) {
    const nextTenSecondBoundary = Math.min(1_200, (Math.floor(timestampSeconds / 10) + 1) * 10);
    timestampSeconds = Math.min(
      nextTenSecondBoundary,
      timestampSeconds + (steps[stepIndex % steps.length] ?? 1),
    );
    timestampsSeconds.push(timestampSeconds);
    stepIndex += 1;
  }
  return timestampsSeconds;
}

const oneSecondTimestamps = Array.from({ length: 1_201 }, (_, second) => second);
const twoSecondTimestamps = Array.from({ length: 601 }, (_, index) => index * 2);
const fiveSecondTimestamps = Array.from({ length: 241 }, (_, index) => index * 5);

export const AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 = {
  version: "aerobic-numerical-trust-fixtures-v1",
  efficiencyCalculationVersion: "aerobic-efficiency-factor-v1",
  decouplingCalculationVersion: "aerobic-decoupling-v1",
  policyVersion: "aerobic-analysis-qualification-v1",
  referenceVersion: "direct-duration-weighted-aerobic-reference-v1",
  tolerances: {
    efficiencyFactor: 1e-12,
    decoupling: 1e-12,
    durationSeconds: 1e-9,
    coverage: 1e-12,
  },
  propertySeed: {
    version: "aerobic-numerical-trust-property-seed-v1",
    value: 0xae30_b1c0,
  },
  knownCyclingDrift: {
    rationale: "The first 600 s are 200 W / 140 bpm and the second 600 s are 200 W / 150 bpm.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: twoHalfSamples({
        outputFirst: 200,
        outputSecond: 200,
        heartRateFirst: 140,
        heartRateSecond: 150,
      }),
    },
    expected: {
      efficiencyFactor: 1.3793103448275863,
      firstHalfEfficiencyFactor: 1.4285714285714286,
      secondHalfEfficiencyFactor: 1.3333333333333333,
      decoupling: 0.0666666666666667,
      contributingDurationSeconds: 1_200,
      averageOutput: 200,
      averageHeartRateBpm: 145,
    },
  },
  knownRunningDrift: {
    rationale: "The first 600 s are 4 m/s / 140 bpm and the second 600 s are 4 m/s / 150 bpm.",
    input: {
      modality: "running",
      outputUnit: "meters_per_second",
      samples: twoHalfSamples({
        outputFirst: 4,
        outputSecond: 4,
        heartRateFirst: 140,
        heartRateSecond: 150,
      }),
    },
    expected: {
      efficiencyFactor: 0.027586206896551724,
      firstHalfEfficiencyFactor: 0.02857142857142857,
      secondHalfEfficiencyFactor: 0.02666666666666667,
      decoupling: 0.06666666666666662,
      contributingDurationSeconds: 1_200,
      averageOutput: 4,
      averageHeartRateBpm: 145,
    },
  },
  validZeroDrift: {
    rationale: "Equal 200 W / 145 bpm halves produce a real zero decoupling ratio.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(1_200, 200, 145),
    },
    expected: { efficiencyFactor: 1.3793103448275863, decoupling: 0 },
  },
  negativeDrift: {
    rationale: "HR falls from 150 to 140 bpm at the same output, so EF improves.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: twoHalfSamples({
        outputFirst: 200,
        outputSecond: 200,
        heartRateFirst: 150,
        heartRateSecond: 140,
      }),
    },
    expected: { efficiencyFactor: 1.3793103448275863, decoupling: -0.07142857142857134 },
  },
  representations: {
    rationale:
      "Equivalent two-half signals have one result at one-, two-, five-second, and irregular source rates.",
    oneSecond: samplesAtTimestamps(oneSecondTimestamps),
    twoSecond: samplesAtTimestamps(twoSecondTimestamps),
    fiveSecond: samplesAtTimestamps(fiveSecondTimestamps),
    irregular: samplesAtTimestamps(irregularTimestamps()),
    expected: { efficiencyFactor: 1.3793103448275863, decoupling: 0.0666666666666667 },
  },
  asymmetricSampleDensity: {
    rationale:
      "One-second first-half samples and five-second second-half samples still split at 600 contributing seconds, not the source-sample midpoint.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: [
        ...samplesAtTimestamps(Array.from({ length: 601 }, (_, second) => second)),
        ...samplesAtTimestamps(Array.from({ length: 120 }, (_, index) => 605 + index * 5)),
      ],
    },
    expected: {
      sourceSampleMidpointTimestampSeconds: 360,
      targetHalfDurationSeconds: 600,
      decoupling: 0.0666666666666667,
    },
  },
  overMaximumGap: {
    rationale:
      "A six-second gap is excluded and reset; two retained 600-second segments remain qualified partial evidence.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: [
        ...constantSamples(600, 200, 145),
        { timestampSeconds: 606, output: 200, heartRateBpm: 145 },
        ...Array.from({ length: 600 }, (_, index) => ({
          timestampSeconds: index + 607,
          output: 200,
          heartRateBpm: 145,
        })),
      ],
    },
    expected: {
      status: "partial",
      decoupling: 0,
      contributingDurationSeconds: 1_200,
      eligibleDurationSeconds: 1_206,
      excludedGapDurationSeconds: 6,
      coverage: 1_200 / 1_206,
    },
  },
  knownPause: {
    rationale:
      "A known paused second resets the segment but stays outside coverage and status degradation.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: [
        ...constantSamples(600, 200, 145),
        { timestampSeconds: 601, output: 900, heartRateBpm: 200, included: false },
        ...Array.from({ length: 600 }, (_, index) => ({
          timestampSeconds: index + 602,
          output: 200,
          heartRateBpm: 145,
        })),
      ],
    },
    expected: {
      status: "available",
      decoupling: 0,
      contributingDurationSeconds: 1_200,
      eligibleDurationSeconds: 1_200,
      excludedInactiveDurationSeconds: 1,
    },
  },
  missingHeartRateInterval: {
    rationale:
      "One missing HR second is safely excluded; enough complete time remains for a numeric partial result.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: [
        ...constantSamples(600, 200, 145),
        { timestampSeconds: 601, output: 200, heartRateBpm: null },
        ...Array.from({ length: 600 }, (_, index) => ({
          timestampSeconds: index + 602,
          output: 200,
          heartRateBpm: 145,
        })),
      ],
    },
    expected: {
      status: "partial",
      decoupling: 0,
      contributingDurationSeconds: 1_200,
      eligibleDurationSeconds: 1_201,
      excludedMissingHeartRateDurationSeconds: 1,
      coverage: 1_200 / 1_201,
    },
  },
  insufficientHeartRateCoverage: {
    rationale:
      "Two hundred missing HR seconds leave 1,200 contributing seconds but only 85.7% HR coverage.",
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: Array.from({ length: 1_401 }, (_, timestampSeconds) => ({
        timestampSeconds,
        output: 200,
        heartRateBpm: timestampSeconds <= 200 ? null : 145,
      })),
    },
    expected: {
      reason: "insufficient_heart_rate_coverage",
      contributingDurationSeconds: 1_200,
      eligibleDurationSeconds: 1_400,
      heartRateCoverage: 1_200 / 1_400,
    },
  },
  insufficientEfficiencyDuration: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(599, 200, 145),
    },
    expected: { reason: "insufficient_duration", contributingDurationSeconds: 599 },
  },
  insufficientDecouplingHalves: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(1_199, 200, 145),
    },
    expected: { reason: "insufficient_half_duration", halfDurationSeconds: 599.5 },
  },
  missingHeartRate: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(1_200, 200, null),
    },
    expected: { reason: "missing_heart_rate" },
  },
  zeroHeartRate: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(1_200, 200, 0),
    },
    expected: { reason: "zero_heart_rate" },
  },
  zeroOutput: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: constantSamples(1_200, 0, 145),
    },
    expected: { reason: "zero_output" },
  },
  unsteadyEffort: {
    input: {
      modality: "cycling",
      outputUnit: "watts",
      samples: twoHalfSamples({
        outputFirst: 100,
        outputSecond: 300,
        heartRateFirst: 145,
        heartRateSecond: 145,
      }),
    },
    expected: { reason: "unsteady_effort" },
  },
  modalityMismatch: {
    input: {
      modality: "cycling",
      outputUnit: "meters_per_second",
      samples: constantSamples(1_200, 4, 145),
    },
    expected: { reason: "modality_mismatch" },
  },
  unsupportedModality: {
    input: { modality: "unsupported", outputUnit: "unsupported", samples: [] },
    expected: { reason: "unsupported_modality" },
  },
} as const;

export type AerobicNumericalTrustFixturesV1 = typeof AEROBIC_NUMERICAL_TRUST_FIXTURES_V1;
