import type { SwimLengthTimingInput } from "../../../activity-analysis/swim-timing";
import type { HeartRateDurationSample } from "../../../zones/heart-rate-duration";

function constantHeartRateSamples(input: {
  durationSeconds: number;
  heartRateBpm: number | null;
  intervalSeconds?: number;
}): HeartRateDurationSample[] {
  const intervalSeconds = input.intervalSeconds ?? 1;
  const samples: HeartRateDurationSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= input.durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    samples.push({ timestampSeconds, heartRateBpm: input.heartRateBpm });
  }
  return samples;
}

const completeSwimLengths = [
  { lengthType: "active", totalTimerTime: 30, totalElapsedTime: 30 },
  { lengthType: "rest", totalElapsedTime: 20 },
  { lengthType: "active", totalTimerTime: 30, totalElapsedTime: 30 },
  { lengthType: "idle", totalElapsedTime: 40 },
] as const satisfies readonly SwimLengthTimingInput[];

const irregularHeartRateSamples: readonly HeartRateDurationSample[] = [
  { timestampSeconds: 0, heartRateBpm: null },
  { timestampSeconds: 5, heartRateBpm: 128 },
  { timestampSeconds: 9, heartRateBpm: 136 },
  { timestampSeconds: 14, heartRateBpm: 136 },
  { timestampSeconds: 17, heartRateBpm: 146 },
  { timestampSeconds: 22, heartRateBpm: 146 },
  { timestampSeconds: 26, heartRateBpm: 155 },
  { timestampSeconds: 31, heartRateBpm: 155 },
  { timestampSeconds: 36, heartRateBpm: 160 },
];

export const SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 = {
  version: "swimming-heart-rate-numerical-trust-fixtures-v1",
  swimTimingCalculationVersion: "swim-active-rest-duration-v1",
  heartRateDurationCalculationVersion: "heart-rate-zone-duration-v1",
  heartRateCommonLoadCalculationVersion: "heart-rate-common-load-v1",
  referenceVersion: "independent-swimming-heart-rate-reference-v1",
  propertySeed: {
    version: "swimming-heart-rate-numerical-trust-property-seed-v1",
    value: 0x5eed_5005,
  },
  tolerances: {
    durationSeconds: 1e-12,
    intensity: 1e-12,
    commonLoad: 1e-12,
  },
  swimTiming: {
    complete: {
      rationale: "Two active lengths total 60 s; explicit rest and idle lengths total 60 s.",
      elapsedDurationSeconds: 120,
      expectedActiveLengthCount: 2,
      lengths: completeSwimLengths,
      expected: {
        status: "available",
        activeDurationSeconds: 60,
        restDurationSeconds: 60,
        knownDurationSeconds: 120,
      },
    },
    reordered: {
      rationale: "Length order does not change additive active/rest duration evidence.",
      elapsedDurationSeconds: 120,
      expectedActiveLengthCount: 2,
      lengths: [
        completeSwimLengths[3],
        completeSwimLengths[1],
        completeSwimLengths[2],
        completeSwimLengths[0],
      ],
    },
    partial: {
      rationale:
        "A missing active-length duration preserves known time but cannot claim completeness.",
      elapsedDurationSeconds: 120,
      expectedActiveLengthCount: 2,
      lengths: [
        { lengthType: "active", totalTimerTime: 30 },
        { lengthType: "active" },
        { lengthType: "rest", totalElapsedTime: 30 },
      ],
      expected: {
        status: "partial",
        activeDurationSeconds: 30,
        restDurationSeconds: 30,
        knownDurationSeconds: 60,
      },
    },
    invalidOverflow: {
      rationale: "Known length durations cannot exceed session elapsed duration.",
      elapsedDurationSeconds: 60,
      lengths: [
        { lengthType: "active", totalTimerTime: 45 },
        { lengthType: "rest", totalElapsedTime: 30 },
      ],
      expected: { status: "unavailable", reason: "invalid_timing" },
    },
    thresholdHour: {
      rationale:
        "A 4,200 s session with 3,600 active seconds and 600 rest seconds uses only active time for threshold Load.",
      elapsedDurationSeconds: 4_200,
      activeDurationSeconds: 3_600,
      restDurationSeconds: 600,
      distanceMeters: 3_600,
      thresholdPaceSecondsPer100m: 100,
      expected: { thresholdSpeedMetersPerSecond: 1, intensity: 1, commonLoad: 100 },
    },
  },
  heartRate: {
    lthrBpm: 160,
    maxGapSeconds: 5,
    irregularComplete: {
      rationale:
        "Irregular intervals are assigned to the current sample and weighted by exact duration.",
      samples: irregularHeartRateSamples,
      expected: {
        status: "available",
        coverageSeconds: 36,
        eligibleDurationSeconds: 36,
        sourceTimeCoverage: 1,
        timeWeightedAverageBpm: 145.19444444444446,
        zoneSeconds: [5, 9, 8, 9, 5],
        rawCommonLoad: 0.8280566406250001,
        rawIntensity: 0.9099761758557199,
      },
    },
    exactMaximumGap: {
      rationale: "An interval exactly at the five-second maximum contributes.",
      samples: [
        { timestampSeconds: 0, heartRateBpm: null },
        { timestampSeconds: 5, heartRateBpm: 160 },
      ],
      expected: { status: "available", coverageSeconds: 5 },
    },
    overMaximumGap: {
      rationale:
        "A six-second valid interval is a gap; later qualified intervals remain partial evidence.",
      samples: [
        { timestampSeconds: 0, heartRateBpm: null },
        { timestampSeconds: 5, heartRateBpm: 160 },
        { timestampSeconds: 11, heartRateBpm: 160 },
        ...constantHeartRateSamples({ durationSeconds: 30, heartRateBpm: 160 })
          .slice(1)
          .map((sample) => ({
            ...sample,
            timestampSeconds: sample.timestampSeconds + 11,
          })),
      ],
      expected: {
        status: "partial",
        coverageSeconds: 35,
        eligibleDurationSeconds: 41,
        sourceTimeCoverage: 35 / 41,
        excludedGapDurationSeconds: 6,
      },
    },
    paused: {
      rationale: "Known paused time is excluded from both contributing and eligible HR duration.",
      samples: [
        { timestampSeconds: 0, heartRateBpm: null },
        { timestampSeconds: 5, heartRateBpm: 160 },
        { timestampSeconds: 15, heartRateBpm: 250, included: false },
        { timestampSeconds: 20, heartRateBpm: 160 },
        { timestampSeconds: 25, heartRateBpm: 160 },
        { timestampSeconds: 30, heartRateBpm: 160 },
        { timestampSeconds: 35, heartRateBpm: 160 },
        { timestampSeconds: 40, heartRateBpm: 160 },
        { timestampSeconds: 45, heartRateBpm: 160 },
      ],
      expected: {
        status: "available",
        coverageSeconds: 35,
        eligibleDurationSeconds: 35,
        pausedDurationSeconds: 10,
      },
    },
    missing: {
      rationale:
        "Missing HR excludes exact intervals and produces qualified partial evidence at 80% coverage.",
      samples: Array.from({ length: 11 }, (_, index) => ({
        timestampSeconds: index * 5,
        heartRateBpm: index === 5 || index === 6 ? null : 160,
      })),
      expected: {
        status: "partial",
        coverageSeconds: 40,
        eligibleDurationSeconds: 50,
        sourceTimeCoverage: 0.8,
        excludedMissingDurationSeconds: 10,
        rawCommonLoad: 40 / 36,
      },
    },
    zeroDropout: {
      rationale: "Zero BPM is invalid dropout, not a measured zero-intensity interval.",
      samples: Array.from({ length: 9 }, (_, index) => ({
        timestampSeconds: index * 5,
        heartRateBpm: index === 4 ? 0 : 160,
      })),
      expected: {
        status: "partial",
        coverageSeconds: 35,
        eligibleDurationSeconds: 40,
        excludedInvalidDurationSeconds: 5,
      },
    },
    lowCoverage: {
      rationale:
        "Seventy percent HR coverage remains zone evidence but is unavailable for Common Load.",
      samples: Array.from({ length: 11 }, (_, index) => ({
        timestampSeconds: index * 5,
        heartRateBpm: index === 3 || index === 4 || index === 5 ? null : 160,
      })),
      expected: {
        status: "partial",
        coverageSeconds: 35,
        eligibleDurationSeconds: 50,
        sourceTimeCoverage: 0.7,
      },
    },
    allMissing: {
      rationale: "An all-missing stream is unavailable and never becomes five zero-duration zones.",
      samples: constantHeartRateSamples({ durationSeconds: 30, heartRateBpm: null }),
      expected: { status: "unavailable", reason: "no_contributing_intervals" },
    },
    minimumEvidence: {
      before: constantHeartRateSamples({ durationSeconds: 29, heartRateBpm: 160 }),
      at: constantHeartRateSamples({ durationSeconds: 30, heartRateBpm: 160 }),
      expectedBefore: { status: "unavailable", reason: "insufficient_coverage" },
      expectedAt: { status: "available", load: 100 / 120, intensity: 1 },
    },
    thresholdHour: {
      rationale: "One qualified active hour at LTHR has intensity 1 and 100 Common Load.",
      samples: constantHeartRateSamples({ durationSeconds: 3_600, heartRateBpm: 160 }),
      expected: { status: "available", load: 100, intensity: 1 },
    },
    zoneBoundaries: {
      rationale:
        "LTHR ratios use half-open [81%, 90%, 94%, 100%) boundaries and an inclusive top zone.",
      lthrBpm: 100,
      samples: [80, 81, 89, 90, 93, 94, 99, 100].map((heartRateBpm, index) => ({
        timestampSeconds: index + 1,
        heartRateBpm,
      })),
      anchor: { timestampSeconds: 0, heartRateBpm: null },
      expectedZoneSeconds: [1, 2, 2, 2, 1],
    },
    timestampOrdering: {
      rationale:
        "Duplicate and reversed samples are ignored without moving the accepted cursor and make numeric evidence partial.",
      samples: [
        { timestampSeconds: 0, heartRateBpm: null },
        { timestampSeconds: 5, heartRateBpm: 160 },
        { timestampSeconds: 5, heartRateBpm: 30 },
        { timestampSeconds: 4, heartRateBpm: 30 },
        { timestampSeconds: 10, heartRateBpm: 160 },
        { timestampSeconds: 15, heartRateBpm: 160 },
        { timestampSeconds: 20, heartRateBpm: 160 },
        { timestampSeconds: 25, heartRateBpm: 160 },
        { timestampSeconds: 30, heartRateBpm: 160 },
        { timestampSeconds: 35, heartRateBpm: 160 },
      ],
      expected: {
        status: "partial",
        coverageSeconds: 35,
        duplicateTimestampCount: 1,
        reversedTimestampCount: 1,
      },
    },
  },
} as const;

export type SwimmingHeartRateNumericalTrustFixturesV1 =
  typeof SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1;
