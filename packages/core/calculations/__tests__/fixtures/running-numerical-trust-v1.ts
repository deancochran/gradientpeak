import type { ReferenceRunningNgpSample } from "../support/running-normalized-graded-pace-reference";

const THRESHOLD_SPEED_METERS_PER_SECOND = 10 / 3;

function constantSamples(
  speedMetersPerSecond: number,
  durationSeconds: number,
  options: { grade?: number; intervalSeconds?: number; elevationOffsetMeters?: number } = {},
): ReferenceRunningNgpSample[] {
  const grade = options.grade ?? 0;
  const intervalSeconds = options.intervalSeconds ?? 1;
  const elevationOffsetMeters = options.elevationOffsetMeters ?? 100;
  const samples: ReferenceRunningNgpSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    samples.push({
      timestampSeconds,
      speedMetersPerSecond,
      elevationMeters: elevationOffsetMeters + timestampSeconds * speedMetersPerSecond * grade,
    });
  }
  return samples;
}

function variableFlatSamples(timestampsSeconds: readonly number[]): ReferenceRunningNgpSample[] {
  return timestampsSeconds.map((timestampSeconds) => ({
    timestampSeconds,
    speedMetersPerSecond: timestampSeconds <= 30 ? 3 : 4,
    elevationMeters: 100,
  }));
}

const oneSecondTimestamps = Array.from({ length: 61 }, (_, second) => second);
const twoSecondTimestamps = Array.from({ length: 31 }, (_, index) => index * 2);
const fiveSecondTimestamps = Array.from({ length: 13 }, (_, index) => index * 5);
const irregularTimestamps = [0, 3, 8, 13, 18, 23, 28, 30, 34, 39, 44, 49, 54, 59, 60];

export const RUNNING_NUMERICAL_TRUST_FIXTURES_V1 = {
  version: "running-numerical-trust-fixtures-v1",
  calculationVersion: "running-normalized-graded-pace-v1",
  referenceVersion: "direct-running-ngp-reference-v1",
  commonLoadVersion: "1",
  tolerances: {
    normalizedGradedSpeedMetersPerSecond: 1e-10,
    normalizedIntensity: 1e-12,
    commonLoad: 1e-10,
    durationSeconds: 1e-9,
    distanceMeters: 1e-8,
  },
  propertySeed: {
    version: "running-numerical-trust-property-seed-v1",
    value: 0x2eed_2026,
  },
  canonicalThresholdHour: {
    rationale:
      "Sixty active minutes at 5:00/km on flat aligned evidence with a 5:00/km threshold is intensity 1, 12,000 m, and 100 Common Load.",
    samples: constantSamples(THRESHOLD_SPEED_METERS_PER_SECOND, 3_600),
    thresholdPaceSecondsPerKm: 300,
    thresholdSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
      normalizedIntensity: 1,
      commonLoad: 100,
      elapsedDurationSeconds: 3_600,
      activeDurationSeconds: 3_600,
      movingDurationSeconds: 3_600,
      distanceMeters: 12_000,
      diagnostics: {
        contributingDurationSeconds: 3_600,
        normalizedDurationSeconds: 3_571,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  flat: {
    rationale: "A complete flat constant four metre-per-second signal remains exactly 4 m/s.",
    samples: constantSamples(4, 60),
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 4,
      diagnostics: { contributingDurationSeconds: 60, normalizedDurationSeconds: 31 },
    },
  },
  ascent: {
    rationale: "A constant ten-percent ascent applies the literal v1 grade-cost ratio.",
    samples: constantSamples(4, 60, { grade: 0.1 }),
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 6.631348888888889,
      diagnostics: { contributingDurationSeconds: 60, normalizedDurationSeconds: 31 },
    },
  },
  descent: {
    rationale: "A constant ten-percent descent applies the literal v1 grade-cost ratio.",
    samples: constantSamples(4, 60, { grade: -0.1 }),
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 2.3907844444444444,
      diagnostics: { contributingDurationSeconds: 60, normalizedDurationSeconds: 31 },
    },
  },
  irregularRepresentations: {
    rationale:
      "Equivalent flat 30-second blocks at 3 then 4 m/s have one literal NGP across one-, two-, five-second, and irregular source rates.",
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 3.5375688184957137,
      diagnostics: { contributingDurationSeconds: 60, normalizedDurationSeconds: 31 },
    },
    oneSecond: variableFlatSamples(oneSecondTimestamps),
    twoSecond: variableFlatSamples(twoSecondTimestamps),
    fiveSecond: variableFlatSamples(fiveSecondTimestamps),
    irregular: variableFlatSamples(irregularTimestamps),
  },
  irregularParity: {
    rationale:
      "An irregular-rate running stream remains final and numerically aligned across import and live calculation.",
    samples: variableFlatSamples(irregularTimestamps),
    thresholdPaceSecondsPerKm: 300,
    thresholdSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 3.5375688184957137,
      normalizedIntensity: 3.5375688184957137 / THRESHOLD_SPEED_METERS_PER_SECOND,
      commonLoad:
        (60 / 3_600) * (3.5375688184957137 / THRESHOLD_SPEED_METERS_PER_SECOND) ** 2 * 100,
      elapsedDurationSeconds: 60,
      activeDurationSeconds: 60,
      movingDurationSeconds: 60,
      distanceMeters: 210,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        excludedGapDurationSeconds: 0,
        excludedInactiveDurationSeconds: 0,
        excludedMissingDurationSeconds: 0,
      },
    },
  },
  exactBoundary: {
    rationale:
      "Twenty-nine seconds cannot form a complete window; exactly 30 seconds produces one NGP observation.",
    before: constantSamples(4, 29),
    at: constantSamples(4, 30),
    expectedBefore: {
      status: "unavailable",
      reason: "insufficient_window",
      normalizedGradedSpeedMetersPerSecond: null,
      diagnostics: { contributingDurationSeconds: 29, normalizedDurationSeconds: 0 },
    },
    expectedAt: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 4,
      diagnostics: { contributingDurationSeconds: 30, normalizedDurationSeconds: 1 },
    },
  },
  maximumGap: {
    rationale: "An interval exactly at the five-second maximum contributes without a reset.",
    samples: [
      { timestampSeconds: 0, speedMetersPerSecond: 4, elevationMeters: 100 },
      { timestampSeconds: 5, speedMetersPerSecond: 4, elevationMeters: 100 },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 6,
        speedMetersPerSecond: 4,
        elevationMeters: 100,
      })),
    ],
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 4,
      diagnostics: {
        contributingDurationSeconds: 35,
        normalizedDurationSeconds: 6,
        excludedGapDurationSeconds: 0,
      },
    },
  },
  overMaximumGap: {
    rationale:
      "A six-second interval is excluded as a gap; a later complete segment yields numeric partial NGP.",
    samples: [
      { timestampSeconds: 0, speedMetersPerSecond: 4, elevationMeters: 100 },
      { timestampSeconds: 6, speedMetersPerSecond: 9, elevationMeters: 100 },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 7,
        speedMetersPerSecond: 4,
        elevationMeters: 100,
      })),
    ],
    expected: {
      status: "partial",
      normalizedGradedSpeedMetersPerSecond: 4,
      diagnostics: {
        contributingDurationSeconds: 30,
        normalizedDurationSeconds: 1,
        excludedGapDurationSeconds: 6,
      },
    },
  },
  paused: {
    rationale:
      "One known paused second resets NGP, is excluded from active duration, and does not make source evidence partial.",
    samples: [
      ...constantSamples(THRESHOLD_SPEED_METERS_PER_SECOND, 30),
      {
        timestampSeconds: 31,
        speedMetersPerSecond: 9,
        elevationMeters: 100,
        included: false,
      },
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 32,
        speedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
        elevationMeters: 100,
      })),
    ],
    thresholdPaceSecondsPerKm: 300,
    thresholdSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
      normalizedIntensity: 1,
      commonLoad: 60 / 36,
      elapsedDurationSeconds: 61,
      activeDurationSeconds: 60,
      movingDurationSeconds: 60,
      distanceMeters: 200,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 2,
        excludedInactiveDurationSeconds: 1,
      },
    },
  },
  missingElevation: {
    rationale:
      "One missing elevation point breaks both adjacent grade intervals; complete surrounding windows remain numeric partial evidence.",
    samples: [
      ...constantSamples(THRESHOLD_SPEED_METERS_PER_SECOND, 30),
      {
        timestampSeconds: 31,
        speedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
        elevationMeters: null,
      },
      ...Array.from({ length: 31 }, (_, index) => ({
        timestampSeconds: index + 32,
        speedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
        elevationMeters: 100,
      })),
    ],
    thresholdPaceSecondsPerKm: 300,
    thresholdSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
    expected: {
      status: "partial",
      normalizedGradedSpeedMetersPerSecond: THRESHOLD_SPEED_METERS_PER_SECOND,
      normalizedIntensity: 1,
      commonLoad: 60 / 36,
      elapsedDurationSeconds: 62,
      activeDurationSeconds: 62,
      movingDurationSeconds: 62,
      distanceMeters: (62 * 10) / 3,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 2,
        excludedMissingDurationSeconds: 2,
      },
    },
  },
  timestampOrdering: {
    rationale:
      "A duplicate and reversal are ignored without replacing the elevation anchor and make numeric NGP partial.",
    samples: [
      ...constantSamples(4, 15),
      { timestampSeconds: 15, speedMetersPerSecond: 9, elevationMeters: 900 },
      { timestampSeconds: 14.5, speedMetersPerSecond: 9, elevationMeters: 900 },
      ...Array.from({ length: 45 }, (_, index) => ({
        timestampSeconds: index + 16,
        speedMetersPerSecond: 4,
        elevationMeters: 100,
      })),
    ],
    thresholdPaceSecondsPerKm: 250,
    thresholdSpeedMetersPerSecond: 4,
    expected: {
      status: "partial",
      normalizedGradedSpeedMetersPerSecond: 4,
      normalizedIntensity: 1,
      commonLoad: 60 / 36,
      elapsedDurationSeconds: 60,
      activeDurationSeconds: 60,
      movingDurationSeconds: 60,
      distanceMeters: 240,
      diagnostics: {
        contributingDurationSeconds: 60,
        normalizedDurationSeconds: 31,
        duplicateTimestampCount: 1,
        reversedTimestampCount: 1,
      },
    },
  },
  misalignedElevation: {
    rationale:
      "Half-second-offset elevation observations never align to integer speed observations and cannot produce NGP.",
    samples: Array.from({ length: 31 }, (_, index) => [
      {
        timestampSeconds: index,
        speedMetersPerSecond: 4,
        elevationMeters: null,
      },
      {
        timestampSeconds: index + 0.5,
        speedMetersPerSecond: null,
        elevationMeters: 100,
      },
    ]).flat(),
    expected: {
      status: "unavailable",
      reason: "no_contributing_intervals",
      normalizedGradedSpeedMetersPerSecond: null,
    },
  },
  measuredZero: {
    rationale: "Measured zero speed is finite zero evidence, not a missing running sample.",
    samples: constantSamples(0, 60),
    expected: {
      status: "available",
      normalizedGradedSpeedMetersPerSecond: 0,
      diagnostics: { contributingDurationSeconds: 60, normalizedDurationSeconds: 31 },
    },
  },
} as const;

export type RunningNumericalTrustFixturesV1 = typeof RUNNING_NUMERICAL_TRUST_FIXTURES_V1;
