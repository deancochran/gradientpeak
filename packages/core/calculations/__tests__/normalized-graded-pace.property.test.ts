import { describe, expect, it } from "vitest";

import { activityCalibrationQualitySchema } from "../../activity-analysis/calibration-quality";
import {
  calculateAvailableCommonLoad,
  commonThresholdEvidenceSchema,
} from "../../load/common-relative-load";
import { calculateRunningNormalizedGradedPace } from "../normalized-graded-pace";
import { RUNNING_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/running-numerical-trust-v1";
import {
  calculateReferenceRunningNormalizedGradedPace,
  type ReferenceRunningNgpSample,
} from "./support/running-normalized-graded-pace-reference";

const PROPERTY_CASE_COUNT = 40;
const seedLabel = `${fixtures.propertySeed.version}:0x${fixtures.propertySeed.value.toString(16)}`;

function createGenerator(seed: number) {
  let state = seed >>> 0;
  return {
    integer(minimum: number, maximum: number): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return minimum + (state % (maximum - minimum + 1));
    },
  };
}

function blockIndexAt(timestampSeconds: number, blockCount: number): number {
  const index = Math.max(0, Math.ceil(timestampSeconds / 10) - 1);
  return Math.min(index, blockCount - 1);
}

function elevationAt(
  timestampSeconds: number,
  speeds: readonly number[],
  grades: readonly number[],
): number {
  let elevation = 100;
  let cursor = 0;
  for (let index = 0; index < speeds.length && cursor < timestampSeconds; index += 1) {
    const seconds = Math.min(10, timestampSeconds - cursor);
    elevation += (speeds[index] ?? 0) * (grades[index] ?? 0) * seconds;
    cursor += seconds;
  }
  return elevation;
}

function samplesAtTimestamps(
  timestampsSeconds: readonly number[],
  speeds: readonly number[],
  grades: readonly number[],
): ReferenceRunningNgpSample[] {
  return timestampsSeconds.map((timestampSeconds) => ({
    timestampSeconds,
    speedMetersPerSecond: speeds[blockIndexAt(timestampSeconds, speeds.length)] ?? 0,
    elevationMeters: elevationAt(timestampSeconds, speeds, grades),
  }));
}

function regularRepresentation(
  durationSeconds: number,
  intervalSeconds: 1 | 2 | 5,
  speeds: readonly number[],
  grades: readonly number[],
): ReferenceRunningNgpSample[] {
  return samplesAtTimestamps(
    Array.from(
      { length: durationSeconds / intervalSeconds + 1 },
      (_, index) => index * intervalSeconds,
    ),
    speeds,
    grades,
  );
}

function irregularRepresentation(
  durationSeconds: number,
  speeds: readonly number[],
  grades: readonly number[],
  generator: ReturnType<typeof createGenerator>,
): ReferenceRunningNgpSample[] {
  const timestampsSeconds = [0];
  let current = 0;
  while (current < durationSeconds) {
    const blockBoundary = Math.min(durationSeconds, (Math.floor(current / 10) + 1) * 10);
    current = Math.min(durationSeconds, blockBoundary, current + generator.integer(1, 5));
    timestampsSeconds.push(current);
  }
  return samplesAtTimestamps(timestampsSeconds, speeds, grades);
}

function splitEveryInterval(
  samples: readonly ReferenceRunningNgpSample[],
): ReferenceRunningNgpSample[] {
  const split: ReferenceRunningNgpSample[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    if (current === undefined) continue;
    if (index === 0) {
      split.push(current);
      continue;
    }
    const previous = samples[index - 1];
    if (
      previous === undefined ||
      current.speedMetersPerSecond === null ||
      current.elevationMeters === null ||
      previous.elevationMeters === null
    ) {
      split.push(current);
      continue;
    }
    split.push({
      timestampSeconds: (previous.timestampSeconds + current.timestampSeconds) / 2,
      speedMetersPerSecond: current.speedMetersPerSecond,
      elevationMeters: (previous.elevationMeters + current.elevationMeters) / 2,
      ...(current.included === undefined ? {} : { included: current.included }),
    });
    split.push(current);
  }
  return split;
}

function shiftTimeline(
  samples: readonly ReferenceRunningNgpSample[],
  seconds: number,
): ReferenceRunningNgpSample[] {
  return samples.map((sample) => ({
    ...sample,
    timestampSeconds: sample.timestampSeconds + seconds,
  }));
}

function assertProductionReferenceAgreement(
  samples: readonly ReferenceRunningNgpSample[],
  caseLabel: string,
): number {
  const production = calculateRunningNormalizedGradedPace({ samples });
  const reference = calculateReferenceRunningNormalizedGradedPace({ samples });
  expect(production.status, caseLabel).toBe(reference.status);
  expect(production.diagnostics.contributingDurationSeconds, caseLabel).toBeCloseTo(
    reference.diagnostics.contributingDurationSeconds,
    12,
  );
  expect(production.diagnostics.normalizedDurationSeconds, caseLabel).toBe(
    reference.diagnostics.normalizedDurationSeconds,
  );
  if (
    production.status === "unavailable" ||
    reference.status === "unavailable" ||
    reference.valueMetersPerSecond === null
  ) {
    expect(production.status, caseLabel).toBe("unavailable");
    return 0;
  }
  expect(Number.isFinite(production.valueMetersPerSecond), caseLabel).toBe(true);
  expect(production.valueMetersPerSecond, caseLabel).toBeGreaterThanOrEqual(0);
  expect(
    Math.abs(production.valueMetersPerSecond - reference.valueMetersPerSecond),
    caseLabel,
  ).toBeLessThanOrEqual(fixtures.tolerances.normalizedGradedSpeedMetersPerSecond);
  return production.valueMetersPerSecond;
}

function availableRunningCommonLoad(input: {
  durationSeconds: number;
  normalizedGradedSpeedMetersPerSecond: number;
  thresholdSpeedMetersPerSecond: number;
  sequence: number;
}) {
  const observedAt = "2026-07-31T00:00:00.000Z";
  const thresholdEvidence = commonThresholdEvidenceSchema.parse({
    type: "threshold_speed_mps",
    value: input.thresholdSpeedMetersPerSecond,
    unit: "meters_per_second",
    source: "validated_test",
    observedAt,
    validAt: observedAt,
    freshness: "current",
    calculationVersion: "running-property-threshold-v1",
    sourceFingerprint: `running-property-threshold-${input.sequence}`,
  });
  const quality = activityCalibrationQualitySchema.parse({
    source: "validated_test",
    observed_at: observedAt,
    valid_at: observedAt,
    confidence: "high",
    stale: false,
    estimate: false,
    calculation_version: thresholdEvidence.calculationVersion,
    evidence_fingerprint: thresholdEvidence.sourceFingerprint,
  });
  return calculateAvailableCommonLoad({
    activity_category: "run",
    method: "run_pace_threshold",
    quality,
    thresholdEvidence,
    evidenceFingerprint: `running-property-activity-${input.sequence}`,
    computedAsOf: observedAt,
    estimated: false,
    contributingDurationSeconds: input.durationSeconds,
    intensity: input.normalizedGradedSpeedMetersPerSecond / input.thresholdSpeedMetersPerSecond,
  });
}

describe(`seeded running numerical properties (${seedLabel})`, () => {
  it("is sample-rate stable, timeline-shift invariant, split-equivalent, finite, and plausible", () => {
    const generator = createGenerator(fixtures.propertySeed.value);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const durationSeconds = generator.integer(6, 24) * 10;
      const blockCount = durationSeconds / 10;
      const speeds = Array.from({ length: blockCount }, () => generator.integer(0, 700) / 100);
      const grades = Array.from({ length: blockCount }, () => generator.integer(-20, 20) / 100);
      const oneSecond = regularRepresentation(durationSeconds, 1, speeds, grades);
      const representations = [
        oneSecond,
        regularRepresentation(durationSeconds, 2, speeds, grades),
        regularRepresentation(durationSeconds, 5, speeds, grades),
        irregularRepresentation(durationSeconds, speeds, grades, generator),
        splitEveryInterval(regularRepresentation(durationSeconds, 5, speeds, grades)),
        shiftTimeline(oneSecond, generator.integer(10_000, 1_000_000)),
      ];
      const values = representations.map((samples, representation) =>
        assertProductionReferenceAgreement(
          samples,
          `${seedLabel}:case-${sequence}:representation-${representation}`,
        ),
      );
      const first = values[0] ?? 0;
      const maximumSpeed = Math.max(...speeds, 0);
      for (const value of values) {
        expect(
          Math.abs(value - first),
          `${seedLabel}:case-${sequence}:representation-equivalence`,
        ).toBeLessThanOrEqual(fixtures.tolerances.normalizedGradedSpeedMetersPerSecond);
        expect(value, `${seedLabel}:case-${sequence}:plausibility`).toBeLessThanOrEqual(
          maximumSpeed * 3 + fixtures.tolerances.normalizedGradedSpeedMetersPerSecond,
        );
      }

      const minimumThreshold = Math.max(0.1, first / 1.5);
      const thresholdSpeedMetersPerSecond = minimumThreshold + generator.integer(0, 500) / 100;
      const commonLoad = availableRunningCommonLoad({
        durationSeconds,
        normalizedGradedSpeedMetersPerSecond: first,
        thresholdSpeedMetersPerSecond,
        sequence,
      });
      expect(commonLoad.status, `${seedLabel}:case-${sequence}:load`).toBe("available");
      if (commonLoad.status !== "available") throw new Error(`${seedLabel}:case-${sequence}`);
      expect(Number.isFinite(commonLoad.load), `${seedLabel}:case-${sequence}:load`).toBe(true);
      expect(commonLoad.load, `${seedLabel}:case-${sequence}:load`).toBeGreaterThanOrEqual(0);
      expect(commonLoad.load, `${seedLabel}:case-${sequence}:load-formula`).toBeCloseTo(
        (durationSeconds / 3_600) * commonLoad.intensity ** 2 * 100,
        12,
      );
    }
  });

  it("keeps seeded gaps, pauses, missing values, duplicates, and reversals reference-aligned", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0xa11c_e55);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const samples = regularRepresentation(
        180,
        1,
        Array.from({ length: 18 }, () => generator.integer(0, 700) / 100),
        Array.from({ length: 18 }, () => generator.integer(-20, 20) / 100),
      );
      const mutation = generator.integer(0, 5);
      if (mutation === 0) {
        const paused = samples[40];
        if (paused !== undefined) samples[40] = { ...paused, included: false };
      } else if (mutation === 1) {
        const missing = samples[40];
        if (missing !== undefined) samples[40] = { ...missing, elevationMeters: null };
      } else if (mutation === 2) {
        samples.splice(40, 5);
      } else if (mutation === 3) {
        const duplicate = samples[40];
        if (duplicate !== undefined) samples.splice(41, 0, { ...duplicate });
      } else if (mutation === 4) {
        const prior = samples[40];
        if (prior !== undefined) {
          samples.splice(41, 0, {
            ...prior,
            timestampSeconds: prior.timestampSeconds - 0.5,
          });
        }
      } else {
        const missing = samples[40];
        if (missing !== undefined) samples[40] = { ...missing, speedMetersPerSecond: null };
      }
      assertProductionReferenceAgreement(samples, `${seedLabel}:mutated-case-${sequence}`);
    }
  });

  it("rejects seeded invalid speed, elevation, timestamps, and thresholds", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0x1bad_b002);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      expect(
        () =>
          calculateRunningNormalizedGradedPace({
            samples: [
              { timestampSeconds: 0, speedMetersPerSecond: 4, elevationMeters: 100 },
              {
                timestampSeconds: 1,
                speedMetersPerSecond: -generator.integer(1, 1_000),
                elevationMeters: 100,
              },
            ],
          }),
        `${seedLabel}:case-${sequence}:speed`,
      ).toThrow();
      expect(
        () =>
          calculateRunningNormalizedGradedPace({
            samples: [
              {
                timestampSeconds: Number.NaN,
                speedMetersPerSecond: 4,
                elevationMeters: 100,
              },
            ],
          }),
        `${seedLabel}:case-${sequence}:timestamp`,
      ).toThrow();
      expect(
        () =>
          calculateRunningNormalizedGradedPace({
            samples: [
              {
                timestampSeconds: 0,
                speedMetersPerSecond: 4,
                elevationMeters: Number.POSITIVE_INFINITY,
              },
            ],
          }),
        `${seedLabel}:case-${sequence}:elevation`,
      ).toThrow();
      expect(
        () =>
          availableRunningCommonLoad({
            durationSeconds: 60,
            normalizedGradedSpeedMetersPerSecond: 4,
            thresholdSpeedMetersPerSecond: -generator.integer(1, 500),
            sequence,
          }),
        `${seedLabel}:case-${sequence}:threshold`,
      ).toThrow();
    }
  });
});
