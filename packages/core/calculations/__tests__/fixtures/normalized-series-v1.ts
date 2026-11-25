import type { NormalizedSeriesSample } from "../../normalized-series";

const constantSamples = (value: number, lastSecond: number): NormalizedSeriesSample[] =>
  Array.from({ length: lastSecond + 1 }, (_, timestampSeconds) => ({
    timestampSeconds,
    value,
  }));

const orderedWithTimestampAnomalies: NormalizedSeriesSample[] = [
  ...constantSamples(200, 15),
  { timestampSeconds: 15, value: 1_000 },
  { timestampSeconds: 14.5, value: 1_000 },
  ...Array.from({ length: 15 }, (_, index) => ({
    timestampSeconds: index + 16,
    value: 200,
  })),
];

export const NORMALIZED_SERIES_REFERENCE_FIXTURES_V1 = {
  version: "normalized-series-reference-fixtures-v1",
  tolerance: 1e-9,
  constant: {
    rationale: "A constant 30-second source interval must normalize to the observed value.",
    samples: constantSamples(200, 30),
    expectedValue: 200,
    expectedNormalizedDurationSeconds: 1,
  },
  variable: {
    rationale:
      "Two timestamp-weighted rolling windows are combined by a duration-weighted fourth-power mean.",
    samples: [
      { timestampSeconds: 0, value: 100 },
      { timestampSeconds: 10, value: 100 },
      { timestampSeconds: 20, value: 200 },
      { timestampSeconds: 30, value: 300 },
      { timestampSeconds: 40, value: 400 },
    ],
    config: { maxGapSeconds: 10 },
    expectedValue: 263.8975964004231,
    expectedNormalizedDurationSeconds: 20,
  },
  irregular: {
    rationale:
      "Irregular intervals contribute their elapsed seconds, not one vote per source sample.",
    samples: [
      { timestampSeconds: 0, value: 100 },
      { timestampSeconds: 5, value: 100 },
      { timestampSeconds: 15, value: 200 },
      { timestampSeconds: 30, value: 300 },
    ],
    config: { maxGapSeconds: 15 },
    expectedValue: 233.33333333333334,
    expectedContributingDurationSeconds: 30,
  },
  gapPause: {
    rationale:
      "A gap longer than policy is wholly excluded and resets the rolling window; a short post-gap fragment cannot alter prior NP.",
    samples: [
      ...constantSamples(200, 30),
      ...Array.from({ length: 30 }, (_, index) => ({
        timestampSeconds: index + 100,
        value: 1_000,
      })),
    ],
    expectedValue: 200,
    expectedExcludedGapDurationSeconds: 70,
    expectedSegmentCount: 2,
  },
  explicitPause: {
    rationale:
      "An explicitly inactive interval is excluded and resets the window without erasing prior valid normalization.",
    samples: [
      ...constantSamples(200, 30),
      { timestampSeconds: 31, value: 1_000, included: false },
      ...Array.from({ length: 29 }, (_, index) => ({
        timestampSeconds: index + 32,
        value: 1_000,
        included: true,
      })),
    ],
    expectedValue: 200,
    expectedExcludedInactiveDurationSeconds: 1,
  },
  ordering: {
    rationale:
      "Duplicate and reversed source records are diagnosed and ignored without replacing the last accepted sample.",
    samples: orderedWithTimestampAnomalies,
    expectedValue: 200,
    expectedDuplicateTimestampCount: 1,
    expectedReversedTimestampCount: 1,
  },
  beforeBoundary: {
    rationale: "Twenty-nine evidenced seconds do not satisfy a 30-second normalized window.",
    samples: constantSamples(200, 29),
    expectedReason: "insufficient_window",
  },
  atBoundary: {
    rationale: "The interval ending exactly at 30 seconds completes the first full window.",
    samples: constantSamples(200, 30),
    expectedValue: 200,
  },
} as const;

export const NGP_REFERENCE_FIXTURES_V1 = {
  version: "ngp-reference-fixtures-v1",
  tolerance: 1e-9,
  flat: {
    rationale: "Flat grade preserves a constant four metre-per-second stream.",
    expectedValue: 4,
  },
  ascent: {
    rationale: "A constant ten-percent ascent applies the declared Minetti v1 cost ratio.",
    expectedValue: 6.631348888888889,
  },
  descent: {
    rationale: "A constant ten-percent descent applies the declared Minetti v1 cost ratio.",
    expectedValue: 2.3907844444444444,
  },
  missingAlignment: {
    rationale:
      "A missing altitude point remains aligned as missing and breaks both adjacent grade intervals instead of shifting values.",
    missingTimestampSeconds: 15,
    expectedValue: 0,
    expectedMissingValues: 2,
    expectedExcludedMissingDurationSeconds: 2,
  },
} as const;
