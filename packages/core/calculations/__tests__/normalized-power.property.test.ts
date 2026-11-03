import { describe, expect, it } from "vitest";

import { activityCalibrationQualitySchema } from "../../activity-analysis/calibration-quality";
import {
  calculateAvailableCommonLoad,
  commonThresholdEvidenceSchema,
} from "../../load/common-relative-load";
import { calculateCyclingNormalizedPower } from "../normalized-power";
import { CYCLING_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/cycling-numerical-trust-v1";
import {
  calculateReferenceCyclingNormalizedPower,
  type ReferenceCyclingPowerSample,
} from "./support/cycling-normalized-power-reference";

const PROPERTY_CASE_COUNT = 48;
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

function blockPowerAt(timestampSeconds: number, blockPowers: readonly number[]): number {
  const blockIndex = Math.max(0, Math.ceil(timestampSeconds / 10) - 1);
  return blockPowers[Math.min(blockIndex, blockPowers.length - 1)] ?? 0;
}

function regularRepresentation(
  durationSeconds: number,
  intervalSeconds: 1 | 2 | 5,
  blockPowers: readonly number[],
): ReferenceCyclingPowerSample[] {
  const samples: ReferenceCyclingPowerSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    samples.push({
      timestampSeconds,
      powerWatts: blockPowerAt(timestampSeconds, blockPowers),
    });
  }
  return samples;
}

function irregularRepresentation(
  durationSeconds: number,
  blockPowers: readonly number[],
  generator: ReturnType<typeof createGenerator>,
): ReferenceCyclingPowerSample[] {
  const timestampsSeconds = [0];
  let current = 0;
  while (current < durationSeconds) {
    const nextBlockBoundary = Math.min(durationSeconds, (Math.floor(current / 10) + 1) * 10);
    current = Math.min(durationSeconds, nextBlockBoundary, current + generator.integer(1, 5));
    timestampsSeconds.push(current);
  }
  return timestampsSeconds.map((timestampSeconds) => ({
    timestampSeconds,
    powerWatts: blockPowerAt(timestampSeconds, blockPowers),
  }));
}

function assertProductionReferenceAgreement(
  samples: readonly ReferenceCyclingPowerSample[],
): number {
  const production = calculateCyclingNormalizedPower({ samples });
  const reference = calculateReferenceCyclingNormalizedPower({ samples });
  expect(production.status, seedLabel).toBe(reference.status);
  expect(production.diagnostics.contributingDurationSeconds, seedLabel).toBeCloseTo(
    reference.diagnostics.contributingDurationSeconds,
    12,
  );
  expect(production.diagnostics.normalizedDurationSeconds, seedLabel).toBe(
    reference.diagnostics.normalizedDurationSeconds,
  );
  if (
    production.status === "unavailable" ||
    reference.status === "unavailable" ||
    reference.valueWatts === null
  ) {
    expect(production.status, seedLabel).toBe("unavailable");
    return 0;
  }
  expect(Number.isFinite(production.valueWatts), seedLabel).toBe(true);
  expect(production.valueWatts, seedLabel).toBeGreaterThanOrEqual(0);
  expect(Math.abs(production.valueWatts - reference.valueWatts), seedLabel).toBeLessThanOrEqual(
    fixtures.tolerances.normalizedPowerWatts,
  );
  return production.valueWatts;
}

function availableCyclingCommonLoad(input: {
  durationSeconds: number;
  normalizedPowerWatts: number;
  thresholdPowerWatts: number;
  sequence: number;
}) {
  const observedAt = "2026-07-31T00:00:00.000Z";
  const thresholdEvidence = commonThresholdEvidenceSchema.parse({
    type: "ftp_watts",
    value: input.thresholdPowerWatts,
    unit: "watts",
    source: "validated_test",
    observedAt,
    validAt: observedAt,
    freshness: "current",
    calculationVersion: "property-threshold-v1",
    sourceFingerprint: `property-threshold-${input.sequence}`,
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
    activity_category: "bike",
    method: "power_threshold",
    quality,
    thresholdEvidence,
    evidenceFingerprint: `property-activity-${input.sequence}`,
    computedAsOf: observedAt,
    estimated: false,
    contributingDurationSeconds: input.durationSeconds,
    intensity: input.normalizedPowerWatts / input.thresholdPowerWatts,
  });
}

describe(`seeded cycling numerical properties (${seedLabel})`, () => {
  it("keeps valid bounded signals finite, plausible, reference-aligned, and representation-equivalent", () => {
    const generator = createGenerator(fixtures.propertySeed.value);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const durationSeconds = generator.integer(6, 30) * 10;
      const blockPowers = Array.from({ length: durationSeconds / 10 }, () =>
        generator.integer(0, 700),
      );
      const representations = [
        regularRepresentation(durationSeconds, 1, blockPowers),
        regularRepresentation(durationSeconds, 2, blockPowers),
        regularRepresentation(durationSeconds, 5, blockPowers),
        irregularRepresentation(durationSeconds, blockPowers, generator),
      ];
      const normalizedPowers = representations.map(assertProductionReferenceAgreement);
      const maximumPowerWatts = Math.max(...blockPowers);
      for (const normalizedPowerWatts of normalizedPowers) {
        expect(normalizedPowerWatts, `${seedLabel}:case-${sequence}`).toBeLessThanOrEqual(
          maximumPowerWatts + fixtures.tolerances.normalizedPowerWatts,
        );
        expect(
          Math.abs(normalizedPowerWatts - (normalizedPowers[0] ?? normalizedPowerWatts)),
          `${seedLabel}:case-${sequence}`,
        ).toBeLessThanOrEqual(fixtures.tolerances.normalizedPowerWatts);
      }

      const normalizedPowerWatts = normalizedPowers[0] ?? 0;
      const minimumThreshold = Math.max(1, Math.ceil(normalizedPowerWatts / 1.5));
      const thresholdPowerWatts = generator.integer(minimumThreshold, minimumThreshold + 400);
      const commonLoad = availableCyclingCommonLoad({
        durationSeconds,
        normalizedPowerWatts,
        thresholdPowerWatts,
        sequence,
      });
      expect(commonLoad.status, `${seedLabel}:case-${sequence}`).toBe("available");
      if (commonLoad.status !== "available") throw new Error(`${seedLabel}:case-${sequence}`);
      expect(Number.isFinite(commonLoad.load), `${seedLabel}:case-${sequence}`).toBe(true);
      expect(commonLoad.load, `${seedLabel}:case-${sequence}`).toBeGreaterThanOrEqual(0);
      expect(commonLoad.intensity, `${seedLabel}:case-${sequence}`).toBeLessThanOrEqual(1.5);
      expect(commonLoad.load, `${seedLabel}:case-${sequence}`).toBeCloseTo(
        (durationSeconds / 3_600) * commonLoad.intensity ** 2 * 100,
        12,
      );
    }
  });

  it("keeps seeded gaps, pauses, missing values, duplicates, and reversals reference-aligned", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0xa11c_e55);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const blockPowers = Array.from({ length: 18 }, () => generator.integer(0, 700));
      const samples = regularRepresentation(180, 1, blockPowers);
      const mutation = generator.integer(0, 4);
      if (mutation === 0) {
        const paused = samples[40];
        if (paused !== undefined) samples[40] = { ...paused, included: false };
      } else if (mutation === 1) {
        const missing = samples[40];
        if (missing !== undefined) samples[40] = { ...missing, powerWatts: null };
      } else if (mutation === 2) {
        samples.splice(40, 5);
      } else if (mutation === 3) {
        const duplicate = samples[40];
        if (duplicate !== undefined) samples.splice(41, 0, { ...duplicate });
      } else {
        const prior = samples[40];
        if (prior !== undefined) {
          samples.splice(41, 0, {
            timestampSeconds: prior.timestampSeconds - 0.5,
            powerWatts: prior.powerWatts,
          });
        }
      }
      assertProductionReferenceAgreement(samples);
    }
  });

  it("rejects seeded invalid power, timestamps, and thresholds instead of fabricating results", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0x1bad_b002);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const invalidPower = -generator.integer(1, 1_000);
      expect(
        () =>
          calculateCyclingNormalizedPower({
            samples: [
              { timestampSeconds: 0, powerWatts: 100 },
              { timestampSeconds: 1, powerWatts: invalidPower },
            ],
          }),
        `${seedLabel}:case-${sequence}`,
      ).toThrow();
      expect(
        () =>
          calculateCyclingNormalizedPower({
            samples: [{ timestampSeconds: Number.NaN, powerWatts: 100 }],
          }),
        `${seedLabel}:case-${sequence}`,
      ).toThrow();
      expect(
        () =>
          availableCyclingCommonLoad({
            durationSeconds: 60,
            normalizedPowerWatts: 100,
            thresholdPowerWatts: -generator.integer(1, 500),
            sequence,
          }),
        `${seedLabel}:case-${sequence}`,
      ).toThrow();
    }
  });
});
