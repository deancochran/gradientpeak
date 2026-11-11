import { describe, expect, it } from "vitest";
import {
  type BestEffortDurationResult,
  type BestEffortMetric,
  type BestEffortSample,
  extractBestEfforts,
} from "../best-efforts";

const PROPERTY_SEED = 0x5e17_e770;
const PROPERTY_CASE_COUNT = 48;
const BLOCK_SECONDS = 5;
const TOTAL_SECONDS = 60;

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

function valueForIntervalEndingAt(timestampSeconds: number, blocks: readonly number[]): number {
  const blockIndex = Math.max(0, Math.ceil(timestampSeconds / BLOCK_SECONDS) - 1);
  return blocks[Math.min(blockIndex, blocks.length - 1)] ?? 0;
}

function regularSamples(blocks: readonly number[]): BestEffortSample[] {
  return Array.from({ length: TOTAL_SECONDS + 1 }, (_, timestampSeconds) => ({
    timestampSeconds,
    value: valueForIntervalEndingAt(timestampSeconds, blocks),
  }));
}

function irregularSamples(
  blocks: readonly number[],
  generator: ReturnType<typeof createGenerator>,
): BestEffortSample[] {
  const timestamps = [0];
  let timestamp = 0;
  while (timestamp < TOTAL_SECONDS) {
    const nextBlockBoundary = Math.min(
      TOTAL_SECONDS,
      (Math.floor(timestamp / BLOCK_SECONDS) + 1) * BLOCK_SECONDS,
    );
    timestamp = Math.min(nextBlockBoundary, timestamp + generator.integer(1, 5));
    timestamps.push(timestamp);
  }
  return timestamps.map((timestampSeconds) => ({
    timestampSeconds,
    value: valueForIntervalEndingAt(timestampSeconds, blocks),
  }));
}

function referenceBestValue(blocks: readonly number[], durationSeconds: number): number {
  let best = Number.NEGATIVE_INFINITY;
  for (let start = 0; start <= TOTAL_SECONDS - durationSeconds; start += 1) {
    let sum = 0;
    for (let second = start + 1; second <= start + durationSeconds; second += 1) {
      sum += valueForIntervalEndingAt(second, blocks);
    }
    best = Math.max(best, sum / durationSeconds);
  }
  return best;
}

function numericResult(
  result: BestEffortDurationResult,
): Exclude<BestEffortDurationResult, { status: "unavailable" }> {
  if (result.status === "unavailable") throw new Error(`Unexpected ${result.reason}`);
  return result;
}

describe(`seeded best-effort properties (0x${PROPERTY_SEED.toString(16)})`, () => {
  it("is weighted, representation-invariant, shift-invariant, bounded, and reference-aligned", () => {
    const generator = createGenerator(PROPERTY_SEED);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const blocks = Array.from({ length: TOTAL_SECONDS / BLOCK_SECONDS }, () =>
        generator.integer(0, 900),
      );
      const durationSeconds = [5, 10, 15][generator.integer(0, 2)] ?? 5;
      const regular = regularSamples(blocks);
      const irregular = irregularSamples(blocks, generator);
      const shifted = irregular.map((sample) => ({
        ...sample,
        timestampSeconds: sample.timestampSeconds + 1_000_000,
      }));
      const results = [regular, irregular, shifted].map((samples) =>
        numericResult(
          extractBestEfforts({
            metric: "power",
            samples,
            config: { durationsSeconds: [durationSeconds], maxGapSeconds: 5 },
          }).results[0] ?? {
            status: "unavailable",
            reason: "no_samples",
            durationSeconds,
            value: null,
          },
        ),
      );
      const expected = referenceBestValue(blocks, durationSeconds);
      const label = `case-${sequence}`;
      for (const result of results) {
        expect(result.value, label).toBeCloseTo(expected, 12);
        expect(result.value, label).toBeGreaterThanOrEqual(Math.min(...blocks));
        expect(result.value, label).toBeLessThanOrEqual(Math.max(...blocks));
        expect(result.endTimestampSeconds - result.startTimestampSeconds, label).toBe(
          durationSeconds,
        );
        expect(result.windowCoverage, label).toBe(1);
      }
      expect(results[2]?.startTimestampSeconds, label).toBe(
        (results[1]?.startTimestampSeconds ?? 0) + 1_000_000,
      );
    }
  });

  it("never lets a numeric window cross a generated missing, pause, or gap interval", () => {
    const generator = createGenerator(PROPERTY_SEED ^ 0xa11c_e55);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const samples = regularSamples(
        Array.from({ length: TOTAL_SECONDS / BLOCK_SECONDS }, () => generator.integer(1, 900)),
      );
      const boundary = generator.integer(10, 40);
      const mutation = generator.integer(0, 2);
      if (mutation === 0) {
        const sample = samples[boundary];
        if (sample !== undefined) samples[boundary] = { ...sample, value: null };
      } else if (mutation === 1) {
        const sample = samples[boundary];
        if (sample !== undefined) samples[boundary] = { ...sample, included: false };
      } else {
        samples.splice(boundary, 4);
      }

      const extraction = extractBestEfforts({
        metric: "power",
        samples,
        config: { durationsSeconds: [10], maxGapSeconds: 2 },
      });
      const result = extraction.results[0];
      if (result === undefined || result.status === "unavailable") continue;
      const excludedStart = mutation === 2 ? boundary - 1 : boundary - 1;
      const excludedEnd = mutation === 2 ? boundary + 4 : boundary;
      const crossesExcludedInterval =
        result.endTimestampSeconds > excludedStart && result.startTimestampSeconds < excludedEnd;
      expect(crossesExcludedInterval, `case-${sequence}`).toBe(false);
    }
  });

  it("keeps power, raw speed, graded speed, and HR extraction numerically identical", () => {
    const samples = irregularSamples(
      [100, 200, 300, 400, 500, 600, 500, 400, 300, 200, 100, 50],
      createGenerator(PROPERTY_SEED),
    );
    const metrics: BestEffortMetric[] = ["power", "speed", "grade_adjusted_speed", "heart_rate"];
    const values = metrics.map((metric) =>
      numericResult(
        extractBestEfforts({
          metric,
          samples,
          config: { durationsSeconds: [10], maxGapSeconds: 5 },
        }).results[0] ?? {
          status: "unavailable",
          reason: "no_samples",
          durationSeconds: 10,
          value: null,
        },
      ),
    );
    for (const result of values) expect(result).toMatchObject(values[0] ?? {});
  });
});
