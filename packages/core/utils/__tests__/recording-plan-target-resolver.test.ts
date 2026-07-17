import { describe, expect, it } from "vitest";
import { compileActivityPlanV3 } from "../../activity-plan";
import { resolveActivityOccurrenceTrainerIntents } from "../recording-plan-target-resolver";

function occurrence(
  category: "run" | "bike",
  targets: Array<{ type: "%FTP" | "watts" | "speed" | "cadence"; intensity: number }>,
) {
  const compiled = compileActivityPlanV3({
    version: 3,
    segments: [
      {
        role: "activity",
        id: "50000000-0000-4000-8000-000000000001",
        name: "Segment",
        category,
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
  it("resolves cycling power against the occurrence category", () => {
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("bike", [{ type: "%FTP", intensity: 80 }]),
        profileSnapshot: { ftp: 250 },
      }).intents,
    ).toEqual([expect.objectContaining({ type: "set_power", watts: 200 })]);
  });

  it("normalizes run speed from persisted km/h to m/s", () => {
    expect(
      resolveActivityOccurrenceTrainerIntents({
        occurrence: occurrence("run", [{ type: "speed", intensity: 18 }]),
      }).intents,
    ).toEqual([expect.objectContaining({ type: "set_speed", metersPerSecond: 5 })]);
  });
});
