import { describe, expect, it } from "vitest";

import { SWIMMING_HEART_RATE_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "../../calculations/__tests__/fixtures/swimming-heart-rate-numerical-trust-v1";
import {
  calculateReferenceHeartRateDuration,
  calculateReferenceHeartRateZoneSeconds,
} from "../../calculations/__tests__/support/swimming-heart-rate-reference";
import {
  calculateHeartRateDuration,
  calculateHeartRateZoneDuration,
  type HeartRateDurationSample,
} from "../heart-rate-duration";

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

function heartRateAt(timestampSeconds: number, blockHeartRates: readonly number[]): number {
  const blockIndex = Math.max(0, Math.ceil(timestampSeconds / 10) - 1);
  return blockHeartRates[Math.min(blockIndex, blockHeartRates.length - 1)] ?? 160;
}

function regularRepresentation(
  durationSeconds: number,
  intervalSeconds: 1 | 2 | 5,
  blockHeartRates: readonly number[],
): HeartRateDurationSample[] {
  return Array.from({ length: durationSeconds / intervalSeconds + 1 }, (_, index) => {
    const timestampSeconds = index * intervalSeconds;
    return {
      timestampSeconds,
      heartRateBpm: index === 0 ? null : heartRateAt(timestampSeconds, blockHeartRates),
    };
  });
}

function irregularRepresentation(
  durationSeconds: number,
  blockHeartRates: readonly number[],
  generator: ReturnType<typeof createGenerator>,
): HeartRateDurationSample[] {
  const timestamps = [0];
  let timestampSeconds = 0;
  while (timestampSeconds < durationSeconds) {
    const blockBoundary = Math.min(durationSeconds, (Math.floor(timestampSeconds / 10) + 1) * 10);
    timestampSeconds = Math.min(blockBoundary, timestampSeconds + generator.integer(1, 5));
    timestamps.push(timestampSeconds);
  }
  return timestamps.map((timestamp, index) => ({
    timestampSeconds: timestamp,
    heartRateBpm: index === 0 ? null : heartRateAt(timestamp, blockHeartRates),
  }));
}

describe(`seeded heart-rate duration properties (${seedLabel})`, () => {
  it("is representation-invariant for the same bounded piecewise-constant HR signal", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0x48_52);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const durationSeconds = generator.integer(6, 18) * 10;
      const blockHeartRates = Array.from({ length: durationSeconds / 10 }, () =>
        generator.integer(90, 195),
      );
      const representations = [
        regularRepresentation(durationSeconds, 1, blockHeartRates),
        regularRepresentation(durationSeconds, 2, blockHeartRates),
        regularRepresentation(durationSeconds, 5, blockHeartRates),
        irregularRepresentation(durationSeconds, blockHeartRates, generator),
      ];
      const results = representations.map((samples) =>
        calculateHeartRateDuration({ samples, maxGapSeconds: 5 }),
      );
      const expected = results[0];
      if (expected?.status === "unavailable") throw new Error(`${seedLabel}:case-${sequence}`);
      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const samples = representations[index];
        if (result === undefined || samples === undefined) {
          throw new Error(`${seedLabel}:missing-representation-${sequence}`);
        }
        const reference = calculateReferenceHeartRateDuration({ samples, maxGapSeconds: 5 });
        expect(result.status, `${seedLabel}:case-${sequence}`).toBe("available");
        if (result.status === "unavailable") throw new Error(`${seedLabel}:case-${sequence}`);
        expect(result.coverageSeconds).toBe(durationSeconds);
        expect(result.buckets).toEqual(expected?.buckets);
        expect(result.timeWeightedAverageBpm).toBeCloseTo(
          expected?.timeWeightedAverageBpm ?? Number.NaN,
          12,
        );
        expect(result).toMatchObject(reference);
        const zones = calculateHeartRateZoneDuration({
          evidence: result,
          lthrBpm: fixtures.heartRate.lthrBpm,
        });
        expect(zones.status).toBe("available");
        if (zones.status === "unavailable") throw new Error(`${seedLabel}:zones-${sequence}`);
        expect(zones.zoneSeconds.reduce((sum, seconds) => sum + seconds, 0)).toBe(
          result.coverageSeconds,
        );
        expect(zones.zoneSeconds).toEqual(
          calculateReferenceHeartRateZoneSeconds({
            buckets: reference.buckets,
            lthrBpm: fixtures.heartRate.lthrBpm,
          }),
        );
      }
    }
  });

  it("never lets missing, invalid, paused, or over-gap duration enter zone totals", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0xbad_5005);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const samples = regularRepresentation(60, 5, [160, 160, 160, 160, 160, 160]);
      const mutationIndex = generator.integer(2, samples.length - 2);
      const mutation = generator.integer(0, 3);
      const sample = samples[mutationIndex];
      if (sample === undefined) throw new Error(`${seedLabel}:mutation-${sequence}`);
      if (mutation === 0) samples[mutationIndex] = { ...sample, heartRateBpm: null };
      if (mutation === 1) samples[mutationIndex] = { ...sample, heartRateBpm: 0 };
      if (mutation === 2) samples[mutationIndex] = { ...sample, included: false };
      if (mutation === 3) {
        samples[mutationIndex] = { ...sample, timestampSeconds: sample.timestampSeconds + 1 };
      }
      const evidence = calculateHeartRateDuration({ samples, maxGapSeconds: 5 });
      const reference = calculateReferenceHeartRateDuration({ samples, maxGapSeconds: 5 });
      expect(evidence).toMatchObject(reference);
      if (evidence.status === "unavailable") continue;
      const zones = calculateHeartRateZoneDuration({
        evidence,
        lthrBpm: fixtures.heartRate.lthrBpm,
      });
      if (zones.status === "unavailable") throw new Error(`${seedLabel}:zones-${sequence}`);
      expect(zones.zoneSeconds.reduce((sum, seconds) => sum + seconds, 0)).toBe(
        evidence.coverageSeconds,
      );
      expect(evidence.coverageSeconds).toBeLessThanOrEqual(evidence.eligibleDurationSeconds);
    }
  });
});
