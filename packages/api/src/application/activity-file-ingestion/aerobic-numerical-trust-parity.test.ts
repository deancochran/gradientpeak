import {
  type AerobicAnalysisInput,
  selectAerobicDecouplingValue,
  selectEfficiencyFactorValue,
} from "@repo/core/calculations";
import { calculateProvisionalRecordingMetrics } from "@repo/core/recording-metrics";
import { AEROBIC_NUMERICAL_TRUST_FIXTURES_V1 as fixtures } from "@repo/core/testing/aerobic-numerical-trust";
import { describe, expect, it } from "vitest";

import { calculateActivityFileStreamDerivedMetrics } from "./stream-derived-calculations";
import { collectActivityFileStreamMetadata } from "./stream-metadata";

const STARTED_AT_MS = Date.parse("2026-07-31T10:00:00.000Z");

const qualifiedVariableCycling: AerobicAnalysisInput = {
  modality: "cycling",
  outputUnit: "watts",
  samples: Array.from({ length: 1_201 }, (_, timestampSeconds) => ({
    timestampSeconds,
    output: timestampSeconds % 2 === 0 ? 210 : 190,
    heartRateBpm: 145,
  })),
};

const parityCases: ReadonlyArray<{
  name: string;
  input: AerobicAnalysisInput;
  expectedEfficiency: Readonly<Record<string, unknown>>;
  expectedDecoupling: Readonly<Record<string, unknown>>;
}> = [
  {
    name: "steady cycling",
    input: fixtures.knownCyclingDrift.input,
    expectedEfficiency: { status: "available", modality: "cycling", unit: "watts_per_bpm" },
    expectedDecoupling: { status: "available", modality: "cycling", unit: "ratio" },
  },
  {
    name: "qualified variable cycling",
    input: qualifiedVariableCycling,
    expectedEfficiency: { status: "available", modality: "cycling", unit: "watts_per_bpm" },
    expectedDecoupling: { status: "available", modality: "cycling", value: 0 },
  },
  {
    name: "steady running",
    input: fixtures.knownRunningDrift.input,
    expectedEfficiency: {
      status: "available",
      modality: "running",
      unit: "meters_per_second_per_bpm",
    },
    expectedDecoupling: { status: "available", modality: "running", unit: "ratio" },
  },
  {
    name: "missing heart rate",
    input: fixtures.missingHeartRate.input,
    expectedEfficiency: { status: "unavailable", reason: "missing_heart_rate", value: null },
    expectedDecoupling: { status: "unavailable", reason: "missing_heart_rate", value: null },
  },
  {
    name: "known pause",
    input: fixtures.knownPause.input,
    expectedEfficiency: { status: "available" },
    expectedDecoupling: { status: "available", value: 0 },
  },
  {
    name: "over-maximum gap",
    input: fixtures.overMaximumGap.input,
    expectedEfficiency: {
      status: "partial",
      reason: "source_incomplete",
      diagnostics: { excludedGapDurationSeconds: 6 },
    },
    expectedDecoupling: {
      status: "partial",
      reason: "source_incomplete",
      diagnostics: { excludedGapDurationSeconds: 6 },
    },
  },
  {
    name: "insufficient duration",
    input: fixtures.insufficientEfficiencyDuration.input,
    expectedEfficiency: { status: "unavailable", reason: "insufficient_duration", value: null },
    expectedDecoupling: {
      status: "unavailable",
      reason: "insufficient_half_duration",
      value: null,
    },
  },
  {
    name: "unsteady output",
    input: fixtures.unsteadyEffort.input,
    expectedEfficiency: { status: "unavailable", reason: "unsteady_effort", value: null },
    expectedDecoupling: { status: "unavailable", reason: "unsteady_effort", value: null },
  },
];

function calculateImportAndLive(input: AerobicAnalysisInput) {
  const activityCategory = input.modality === "cycling" ? "bike" : "run";
  const records = input.samples.map((sample) => ({
    timestamp: new Date(STARTED_AT_MS + sample.timestampSeconds * 1_000),
    ...(input.modality === "cycling" && sample.output !== null ? { power: sample.output } : {}),
    ...(input.modality === "running" && sample.output !== null
      ? { speed: sample.output, altitude: 100 }
      : {}),
    ...(sample.heartRateBpm === null ? {} : { heartRate: sample.heartRateBpm }),
  }));
  const inclusionTimeline = input.samples.map((sample) => sample.included !== false);
  const imported = calculateActivityFileStreamDerivedMetrics({
    activityCategory,
    distance: 0,
    duration:
      (input.samples.at(-1)?.timestampSeconds ?? 0) - (input.samples[0]?.timestampSeconds ?? 0),
    includedTimeline: inclusionTimeline,
    streamMetadata: collectActivityFileStreamMetadata(records),
  });
  const live = calculateProvisionalRecordingMetrics({
    config: { activityCategory },
    samples: input.samples.map((sample) => ({
      timestampMs: STARTED_AT_MS + sample.timestampSeconds * 1_000,
      moving: sample.included !== false,
      ...(input.modality === "cycling" ? { powerWatts: sample.output } : {}),
      ...(input.modality === "running" ? { speedMps: sample.output, altitudeMeters: 100 } : {}),
      heartRateBpm: sample.heartRateBpm,
    })),
  });
  return { imported, live };
}

describe("aerobic numerical trust import/live parity", () => {
  it.each(parityCases)("uses the same qualified Core EF/decoupling semantics for $name", ({
    input,
    expectedEfficiency,
    expectedDecoupling,
  }) => {
    const { imported, live } = calculateImportAndLive(input);

    expect(imported.efficiencyFactorResult).toMatchObject(expectedEfficiency);
    expect(imported.aerobicDecouplingResult).toMatchObject(expectedDecoupling);
    expect(live.efficiencyFactorResult).toEqual(imported.efficiencyFactorResult);
    expect(live.aerobicDecouplingResult).toEqual(imported.aerobicDecouplingResult);
    expect(selectEfficiencyFactorValue(live.efficiencyFactorResult)).toBe(
      selectEfficiencyFactorValue(imported.efficiencyFactorResult),
    );
    expect(selectAerobicDecouplingValue(live.aerobicDecouplingResult)).toBe(
      selectAerobicDecouplingValue(imported.aerobicDecouplingResult),
    );
    expect(live).toMatchObject({ stage: "provisional", authority: "live_recording_only" });
  });
});
