import type { ReferenceCyclingPowerSample } from "../support/cycling-normalized-power-reference";

function constantSamples(
  powerWatts: number,
  durationSeconds: number,
  intervalSeconds = 1,
): ReferenceCyclingPowerSample[] {
  const samples: ReferenceCyclingPowerSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    samples.push({ timestampSeconds, powerWatts });
  }
  return samples;
}

function variableSamples(timestampsSeconds: readonly number[]): ReferenceCyclingPowerSample[] {
  return timestampsSeconds.map((timestampSeconds) => ({
    timestampSeconds,
    powerWatts: timestampSeconds <= 30 ? 100 : 300,
  }));
}

const oneSecondTimestamps = Array.from({ length: 61 }, (_, second) => second);
const twoSecondTimestamps = Array.from({ length: 31 }, (_, index) => index * 2);
const fiveSecondTimestamps = Array.from({ length: 13 }, (_, index) => index * 5);
const irregularTimestamps = [0, 3, 8, 13, 18, 23, 28, 30, 34, 39, 44, 49, 54, 59, 60];

export const CYCLING_NUMERICAL_TRUST_FIXTURES_V1 = {
  version: "cycling-numerical-trust-fixtures-v1",
  calculationVersion: "cycling-normalized-power-v1",
  referenceVersion: "direct-one-second-resampling-reference-v1",
  tolerances: {
    normalizedPowerWatts: 1e-10,
    normalizedIntensity: 1e-12,
    commonLoad: 1e-10,
    durationSeconds: 1e-9,
    distanceMeters: 1e-9,
  },
  propertySeed: {
    version: "cycling-numerical-trust-property-seed-v1",
    value: 0x5eed_2026,
  },
  canonicalThresholdHour: {
    rationale:
      "Sixty active minutes at a measured 250 W with a 250 W threshold is intensity 1 and 100 Common Load.",
    samples: constantSamples(250, 3_600),
    thresholdPowerWatts: 250,
    distanceMetersPerSecond: 10,
    expected: {
      status: "available",
      normalizedPowerWatts: 250,
      normalizedIntensity: 1,
      commonLoad: 100,
      durationSeconds: 3_600,
      distanceMeters: 36_000,
      diagnostics: {
        contributingDurationSeconds: 3_600,
        normalizedDurationSeconds: 3_571,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  canonicalHalfThresholdTwoHours: {
    rationale:
      "Two active hours at a measured 125 W with a 250 W threshold is intensity 0.5 and 50 Common Load.",
    samples: constantSamples(125, 7_200),
    thresholdPowerWatts: 250,
    expected: {
      status: "available",
      normalizedPowerWatts: 125,
      normalizedIntensity: 0.5,
      commonLoad: 50,
      durationSeconds: 7_200,
      diagnostics: {
        contributingDurationSeconds: 7_200,
        normalizedDurationSeconds: 7_171,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  constant: {
    rationale: "A complete constant 60-second signal remains exactly 200 W.",
    samples: constantSamples(200, 60),
    expected: {
      status: "available",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  variableRepresentations: {
    rationale:
      "The literal expected value is the fourth root of the mean of 31 rolling values 100 + (200*k/30), k=0..30.",
    expected: {
      status: "available",
      normalizedPowerWatts: 223.0694887793096,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
    oneSecond: variableSamples(oneSecondTimestamps),
    twoSecond: variableSamples(twoSecondTimestamps),
    fiveSecond: variableSamples(fiveSecondTimestamps),
    irregular: variableSamples(irregularTimestamps),
  },
  exactBoundary: {
    rationale:
      "Twenty-nine seconds cannot form a full window; exactly 30 seconds creates one rolling observation.",
    before: constantSamples(200, 29),
    at: constantSamples(200, 30),
    expectedBefore: {
      status: "unavailable",
      reason: "insufficient_window",
      normalizedPowerWatts: null,
      diagnostics: { contributingDurationSeconds: 29, normalizedDurationSeconds: 0 },
    },
    expectedAt: {
      status: "available",
      normalizedPowerWatts: 200,
      diagnostics: { contributingDurationSeconds: 30, normalizedDurationSeconds: 1 },
    },
  },
  maximumGap: {
    rationale:
      "An interval exactly at the five-second maximum contributes and does not break the window.",
    samples: [
      { timestampSeconds: 0, powerWatts: 200 },
      { timestampSeconds: 5, powerWatts: 200 },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 6,
        powerWatts: 200,
      })),
    ],
    expected: {
      status: "available",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 35,
        normalizedDurationSeconds: 6,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  overMaximumGap: {
    rationale:
      "A six-second interval is wholly excluded; the later complete segment remains a numeric partial result.",
    samples: [
      { timestampSeconds: 0, powerWatts: 200 },
      { timestampSeconds: 6, powerWatts: 900 },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 7,
        powerWatts: 200,
      })),
    ],
    expected: {
      status: "partial",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 30,
        normalizedDurationSeconds: 1,
        excludedGapDurationSeconds: 6,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  paused: {
    rationale:
      "A known paused second resets the window but is excluded from active coverage and does not make the result partial.",
    samples: [
      ...constantSamples(200, 30),
      { timestampSeconds: 31, powerWatts: 900, included: false },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 32,
        powerWatts: 200,
      })),
    ],
    expected: {
      status: "available",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 2,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 1,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  missing: {
    rationale:
      "A missing second resets the window and makes the two retained complete windows partial evidence.",
    samples: [
      ...constantSamples(200, 30),
      { timestampSeconds: 31, powerWatts: null },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 32,
        powerWatts: 200,
      })),
    ],
    expected: {
      status: "partial",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 2,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 1,
      },
    },
  },
  zeroCoasting: {
    rationale:
      "Measured zero-power coasting contributes time and returns a real zero instead of missing evidence.",
    samples: constantSamples(0, 60),
    expected: {
      status: "available",
      normalizedPowerWatts: 0,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  timestampOrdering: {
    rationale:
      "One duplicate and one reversal are ignored without moving the accepted timestamp cursor and make the result partial.",
    samples: [
      ...constantSamples(200, 15),
      { timestampSeconds: 15, powerWatts: 900 },
      { timestampSeconds: 14.5, powerWatts: 900 },
      ...Array.from({ length: 45 }, (_, index) => ({
        timestampSeconds: index + 16,
        powerWatts: 200,
      })),
    ],
    expected: {
      status: "partial",
      normalizedPowerWatts: 200,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        duplicateTimestampCount: 1,
        reversedTimestampCount: 1,
      },
    },
  },
} as const;

export type CyclingNumericalTrustFixturesV1 = typeof CYCLING_NUMERICAL_TRUST_FIXTURES_V1;
