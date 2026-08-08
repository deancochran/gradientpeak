import { describe, expect, it } from "vitest";
import { compileActivityPlan } from "../../activity-plan";
import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "../../performance-model";
import type { ActivityTarget } from "../../targets";
import {
  resolveActivityOccurrenceTrainerIntents,
  resolvePerformanceTargetValue,
} from "../recording-plan-target-resolver";

const asOf = "2026-06-01T00:00:00.000Z";

function targets(input: { power?: number; runLthr?: number; runMaxHr?: number } = {}) {
  const unavailable = createUnavailableAthletePerformanceTargetFacts(asOf);
  const heartRate = (metric: "lthr" | "max_hr", valueBpm: number | undefined) =>
    valueBpm === undefined
      ? metric === "lthr"
        ? unavailable.heartRate.run.lthr
        : unavailable.heartRate.run.maxHr
      : {
          ...(metric === "lthr" ? unavailable.heartRate.run.lthr : unavailable.heartRate.run.maxHr),
          status: "available" as const,
          valueBpm,
          observedAt: "2026-05-30T00:00:00.000Z",
          expiresAt: "2026-08-28T00:00:00.000Z",
          sourceEvidenceId: `run-${metric}`,
          sourceActivityId: `run-${metric}-activity`,
          source: "activity_file" as const,
          method:
            metric === "lthr"
              ? ("activity_file_lthr_detection" as const)
              : ("max_hr_progressive_test_v1" as const),
          calculationVersion:
            metric === "lthr"
              ? ("activity-file-lthr-v1" as const)
              : ("max_hr_progressive_test_v1" as const),
          reason: null,
        };
  return athletePerformanceTargetFactsSchema.parse({
    ...unavailable,
    cycling: {
      planningThresholdPower:
        input.power === undefined
          ? unavailable.cycling.planningThresholdPower
          : {
              ...unavailable.cycling.planningThresholdPower,
              status: "available",
              value: input.power,
              calculationVersion: "recording-target-test-v1",
              sourceEvidenceIds: ["power-evidence"],
              evidenceTime: {
                observedFrom: "2026-05-30T00:00:00.000Z",
                observedThrough: "2026-05-30T00:00:00.000Z",
                computedAt: asOf,
              },
              confidence: "high",
              expiresAt: "2026-08-28T00:00:00.000Z",
              reasons: [],
            },
    },
    heartRate: {
      ...unavailable.heartRate,
      run: {
        lthr: heartRate("lthr", input.runLthr),
        maxHr: heartRate("max_hr", input.runMaxHr),
      },
    },
  });
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

  it("fails closed for missing or stale FTP while preserving absolute watts", () => {
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
