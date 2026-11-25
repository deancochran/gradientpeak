import { describe, expect, it } from "vitest";

import {
  type AerobicAnalysisInput,
  calculateAerobicDecoupling,
  calculateEfficiencyFactor,
} from "../efficiency";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "./fixtures/aerobic-numerical-trust-v1";
import {
  calculateReferenceAerobicAnalysis,
  type ReferenceAerobicAnalysisSample,
} from "./support/aerobic-analysis-reference";

const PROPERTY_CASE_COUNT = 32;
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
  return Math.min(blockCount - 1, Math.max(0, Math.ceil(timestampSeconds / 10) - 1));
}

function sampleAt(
  timestampSeconds: number,
  outputs: readonly number[],
  heartRates: readonly number[],
): ReferenceAerobicAnalysisSample {
  const blockIndex = blockIndexAt(timestampSeconds, outputs.length);
  return {
    timestampSeconds,
    output: outputs[blockIndex] ?? 0,
    heartRateBpm: heartRates[blockIndex] ?? 140,
  };
}

function regularRepresentation(
  durationSeconds: number,
  intervalSeconds: 1 | 2 | 5,
  outputs: readonly number[],
  heartRates: readonly number[],
): ReferenceAerobicAnalysisSample[] {
  const samples: ReferenceAerobicAnalysisSample[] = [];
  for (
    let timestampSeconds = 0;
    timestampSeconds <= durationSeconds;
    timestampSeconds += intervalSeconds
  ) {
    samples.push(sampleAt(timestampSeconds, outputs, heartRates));
  }
  return samples;
}

function irregularRepresentation(
  durationSeconds: number,
  outputs: readonly number[],
  heartRates: readonly number[],
  generator: ReturnType<typeof createGenerator>,
): ReferenceAerobicAnalysisSample[] {
  const timestampsSeconds = [0];
  let timestampSeconds = 0;
  while (timestampSeconds < durationSeconds) {
    const nextBlockBoundary = Math.min(
      durationSeconds,
      (Math.floor(timestampSeconds / 10) + 1) * 10,
    );
    timestampSeconds = Math.min(nextBlockBoundary, timestampSeconds + generator.integer(1, 5));
    timestampsSeconds.push(timestampSeconds);
  }
  return timestampsSeconds.map((timestamp) => sampleAt(timestamp, outputs, heartRates));
}

function inputFor(
  modality: "cycling" | "running",
  samples: readonly ReferenceAerobicAnalysisSample[],
): AerobicAnalysisInput {
  return modality === "cycling"
    ? { modality, outputUnit: "watts", samples }
    : { modality, outputUnit: "meters_per_second", samples };
}

describe(`seeded aerobic numerical properties (${seedLabel})`, () => {
  it("matches the independent reference across sample rates for cycling and running", () => {
    const generator = createGenerator(fixtures.propertySeed.value);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const modality = sequence % 2 === 0 ? "cycling" : "running";
      const durationSeconds = generator.integer(60, 90) * 20;
      const blockCount = durationSeconds / 10;
      const baselineOutput = modality === "cycling" ? generator.integer(180, 300) : 3;
      const outputs = Array.from({ length: blockCount }, () => {
        const percent = generator.integer(97, 103) / 100;
        return baselineOutput * percent;
      });
      const heartRates = Array.from({ length: blockCount }, (_, blockIndex) =>
        blockIndex < blockCount / 2 ? generator.integer(138, 142) : generator.integer(147, 151),
      );
      const representations = [
        regularRepresentation(durationSeconds, 1, outputs, heartRates),
        regularRepresentation(durationSeconds, 2, outputs, heartRates),
        regularRepresentation(durationSeconds, 5, outputs, heartRates),
        irregularRepresentation(durationSeconds, outputs, heartRates, generator),
      ];
      const efficiencyValues: number[] = [];
      const decouplingValues: number[] = [];

      for (const samples of representations) {
        const input = inputFor(modality, samples);
        const reference = calculateReferenceAerobicAnalysis({ samples });
        const efficiency = calculateEfficiencyFactor(input);
        const decoupling = calculateAerobicDecoupling(input);
        expect(efficiency.status, `${seedLabel}:case-${sequence}`).toBe("available");
        expect(decoupling.status, `${seedLabel}:case-${sequence}`).toBe("available");
        if (
          efficiency.status === "unavailable" ||
          decoupling.status === "unavailable" ||
          reference.efficiency === null ||
          reference.decoupling === null
        ) {
          throw new Error(`${seedLabel}:case-${sequence}: expected qualified values`);
        }
        expect(Number.isFinite(efficiency.value), `${seedLabel}:case-${sequence}`).toBe(true);
        expect(Number.isFinite(decoupling.value), `${seedLabel}:case-${sequence}`).toBe(true);
        expect(
          Math.abs(efficiency.value - reference.efficiency.efficiencyFactor),
          `${seedLabel}:case-${sequence}`,
        ).toBeLessThanOrEqual(fixtures.tolerances.efficiencyFactor);
        expect(
          Math.abs(decoupling.value - reference.decoupling),
          `${seedLabel}:case-${sequence}`,
        ).toBeLessThanOrEqual(fixtures.tolerances.decoupling);
        efficiencyValues.push(efficiency.value);
        decouplingValues.push(decoupling.value);
      }

      const expectedEfficiency = efficiencyValues[0] ?? Number.NaN;
      const expectedDecoupling = decouplingValues[0] ?? Number.NaN;
      for (const value of efficiencyValues) {
        expect(
          Math.abs(value - expectedEfficiency),
          `${seedLabel}:case-${sequence}`,
        ).toBeLessThanOrEqual(fixtures.tolerances.efficiencyFactor);
      }
      for (const value of decouplingValues) {
        expect(
          Math.abs(value - expectedDecoupling),
          `${seedLabel}:case-${sequence}`,
        ).toBeLessThanOrEqual(fixtures.tolerances.decoupling);
      }
    }
  });

  it("scales EF with output while leaving decoupling unchanged", () => {
    const generator = createGenerator(fixtures.propertySeed.value ^ 0x51ca_1e);
    for (let sequence = 0; sequence < PROPERTY_CASE_COUNT; sequence += 1) {
      const scale = generator.integer(11, 25) / 10;
      const baseInput = fixtures.knownCyclingDrift.input;
      const scaledInput: AerobicAnalysisInput = {
        ...baseInput,
        samples: baseInput.samples.map((sample) => ({
          ...sample,
          output: sample.output === null ? null : sample.output * scale,
        })),
      };
      const baseEfficiency = calculateEfficiencyFactor(baseInput);
      const scaledEfficiency = calculateEfficiencyFactor(scaledInput);
      const baseDecoupling = calculateAerobicDecoupling(baseInput);
      const scaledDecoupling = calculateAerobicDecoupling(scaledInput);
      if (
        baseEfficiency.status === "unavailable" ||
        scaledEfficiency.status === "unavailable" ||
        baseDecoupling.status === "unavailable" ||
        scaledDecoupling.status === "unavailable"
      ) {
        throw new Error(`${seedLabel}:scale-${sequence}: expected qualified values`);
      }
      expect(scaledEfficiency.value, `${seedLabel}:scale-${sequence}`).toBeCloseTo(
        baseEfficiency.value * scale,
        12,
      );
      expect(scaledDecoupling.value, `${seedLabel}:scale-${sequence}`).toBeCloseTo(
        baseDecoupling.value,
        12,
      );
    }
  });
});
