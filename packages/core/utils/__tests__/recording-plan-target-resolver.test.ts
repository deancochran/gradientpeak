import { describe, expect, it } from "vitest";
import { compileActivityPlan } from "../../activity-plan";
import type { ActivityTarget } from "../../targets";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import {
  resolveActivityOccurrenceTrainerIntents,
  resolvePerformanceTargetValue,
} from "../recording-plan-target-resolver";

const asOf = "2026-06-01T00:00:00.000Z";

function targets(
  input: {
    power?: number;
    powerState?: "provisional" | "confirmed" | "stale";
    runLthr?: number;
    runMaxHr?: number;
  } = {},
) {
  const facts = buildPerformanceTargetFactsFixture({
    asOf,
    thresholdEffectiveAt: "2026-05-30T00:00:00.000Z",
    ...(input.power === undefined ? {} : { bikeThresholdWatts: input.power }),
    lthrBpm: input.runLthr === undefined ? {} : { run: input.runLthr },
    maxHrBpm: input.runMaxHr === undefined ? {} : { run: input.runMaxHr },
  });
  if (facts.thresholds.bike.status === "available" && input.powerState) {
    facts.thresholds.bike.state = input.powerState === "stale" ? "confirmed" : input.powerState;
    facts.thresholds.bike.freshness = input.powerState === "stale" ? "stale" : "fresh";
  }
  return facts;
}

function occurrence(activity_category: "run" | "bike" | "swim", targets: ActivityTarget[]) {
  const compiled = compileActivityPlan({
    version: 3,
    activity_category,
    segments: [
      {
        role: "activity",
        id: "50000000-0000-4000-8000-000000000001",
        name: "Segment",
        intervals: [
          {
            id: "50000000-0000-4000-8000-000000000002",
            name: "Set",
            repetitions: 1,
            steps: [
              {
                id: "50000000-0000-4000-8000-000000000003",
                name: "Step",
                duration: { type: "time", seconds: 60 },
                targets,
              },
            ],
          },
        ],
      },
    ],
  });
  const value = compiled.occurrences[0];
  if (!value || value.role !== "activity") throw new Error("Expected activity occurrence");
  return value;
}

describe("resolveActivityOccurrenceTrainerIntents", () => {
  it("resolves cycling power against the occurrence activity_category", () => {
    const performanceTargets = targets({ power: 250 });
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("bike", [{ type: "%FTP", intensity: 80 }]),
        performanceTargets,
      }).intents,
    ).toEqual([expect.objectContaining({ type: "set_power", watts: 200 })]);
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("bike", [{ type: "%FTP", intensity: 80 }]),
        performanceTargets,
        intensityScale: 0.9,
      }).intents,
    ).toEqual([expect.objectContaining({ type: "set_power", watts: 180 })]);
  });

  it("keeps the recording-start target snapshot stable after a later calibration", () => {
    const recordingOccurrence = occurrence("bike", [{ type: "%FTP", intensity: 80 }]);
    const capturedAtStart = targets({ power: 250 });
    const started = resolveActivityOccurrenceTrainerIntents({
      occurrence: recordingOccurrence,
      performanceTargets: capturedAtStart,
    });
    const afterRecalibration = resolveActivityOccurrenceTrainerIntents({
      occurrence: recordingOccurrence,
      performanceTargets: targets({ power: 300 }),
    });

    expect(started.intents).toEqual([expect.objectContaining({ type: "set_power", watts: 200 })]);
    expect(afterRecalibration.intents).toEqual([
      expect.objectContaining({ type: "set_power", watts: 240 }),
    ]);
    expect(started.intents).toEqual([expect.objectContaining({ type: "set_power", watts: 200 })]);
  });

  it.each([
    "provisional",
    "stale",
  ] as const)("exports a structured bike target from a %s valid calibration", (powerState) => {
    const performanceTargets = targets({ power: 250, powerState });
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("bike", [{ type: "%FTP", intensity: 80 }]),
        performanceTargets,
      }),
    ).toMatchObject({
      intents: [expect.objectContaining({ type: "set_power", watts: 200 })],
      unresolvedTargets: [],
    });
  });

  it("fails closed for missing FTP while preserving absolute watts", () => {
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("bike", [{ type: "%FTP", intensity: 80 }]),
        performanceTargets: targets(),
      }).unresolvedTargets,
    ).toEqual([{ type: "%FTP", intensity: 80 }]);

    const performanceTargets = targets();
    const resolution = resolveActivityOccurrenceTrainerIntents({
      occurrence: occurrence("bike", [
        { type: "%FTP", intensity: 80 },
        { type: "watts", intensity: 210 },
      ]),
      performanceTargets,
    });

    expect(resolution.intents).toEqual([
      expect.objectContaining({ type: "set_power", watts: 210 }),
    ]);
    expect(resolution.unresolvedTargets).toEqual([{ type: "%FTP", intensity: 80 }]);
  });

  it("does not export a bike threshold into a mismatched activity-category target", () => {
    expect(
      resolvePerformanceTargetValue({
        target: { type: "%FTP", intensity: 80 },
        activityCategory: "run",
        performanceTargets: targets({ power: 250, powerState: "provisional" }),
      }),
    ).toBeNull();
  });

  it("requires activity-category-specific eligible LTHR and max HR", () => {
    const performanceTargets = targets({ runLthr: 170, runMaxHr: 190 });
    const runTargets = [
      { type: "%ThresholdHR", intensity: 90 },
      { type: "%MaxHR", intensity: 80 },
    ] as const;

    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("run", [...runTargets]),
        performanceTargets,
      }),
    ).toMatchObject({ informationalTargets: runTargets, unresolvedTargets: [] });
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("swim", [...runTargets]),
        performanceTargets,
      }).unresolvedTargets,
    ).toEqual(runTargets);
    expect(
      resolvePerformanceTargetValue({
        target: runTargets[1],
        activityCategory: "run",
        performanceTargets,
      }),
    ).toEqual({ value: 152, unit: "bpm" });
  });

  it("normalizes run speed from persisted km/h to m/s", () => {
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("run", [{ type: "speed", intensity: 18 }]),
      }).intents,
    ).toEqual([expect.objectContaining({ type: "set_speed", metersPerSecond: 5 })]);
  });
});
