import { describe, expect, it } from "vitest";

import {
  ACTIVITY_PLAN_V2_SAVEABLE_LIMITS,
  activityPlanSpeedKphToMetersPerSecond,
  activityPlanSpeedMetersPerSecondToKph,
  activityPlanStructureSchemaV2,
  formatIntensityTarget,
  saveableActivityPlanStructureSchemaV2,
} from "../activity_plan_v2";

const intervalId = "11111111-1111-4111-8111-111111111111";
const stepId = "22222222-2222-4222-8222-222222222222";

describe("activity plan speed target units", () => {
  it("converts persisted/UI km/h values to runtime/export m/s and back", () => {
    expect(activityPlanSpeedKphToMetersPerSecond(18)).toBe(5);
    expect(activityPlanSpeedMetersPerSecondToKph(5)).toBe(18);
  });

  it("preserves legacy V2 speed values as km/h", () => {
    const legacyV2 = {
      version: 2,
      intervals: [
        {
          id: intervalId,
          name: "Legacy run",
          repetitions: 1,
          steps: [
            {
              id: stepId,
              name: "Steady",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "speed", intensity: 18 }],
            },
          ],
        },
      ],
    };

    const parsed = activityPlanStructureSchemaV2.parse(legacyV2);
    const parsedTarget = parsed.intervals[0]?.steps[0]?.targets?.[0];

    expect(parsedTarget).toEqual({
      type: "speed",
      intensity: 18,
    });
    if (!parsedTarget) throw new Error("Expected the legacy speed target to be preserved");
    expect(formatIntensityTarget(parsedTarget)).toBe("18.0 km/h");
  });
});

function createPlan({
  repetitions = 1,
  steps = [
    {
      id: stepId,
      name: "Steady",
      duration: { type: "time" as const, seconds: 3_600 },
      targets: [{ type: "%FTP" as const, intensity: 75 }],
    },
  ],
}: {
  repetitions?: number;
  steps?: Array<{
    id: string;
    name: string;
    duration:
      | { type: "time"; seconds: number }
      | { type: "distance"; meters: number }
      | { type: "repetitions"; count: number };
    targets: Array<{ type: "%FTP" | "watts"; intensity: number }>;
  }>;
} = {}) {
  return {
    version: 2 as const,
    intervals: [{ id: intervalId, name: "Main set", repetitions, steps }],
  };
}

describe("saveableActivityPlanStructureSchemaV2 integrity limits", () => {
  it("preserves common sparse workouts", () => {
    expect(saveableActivityPlanStructureSchemaV2.safeParse(createPlan()).success).toBe(true);
  });

  it("rejects per-step duration, distance, repetition, and target overages", () => {
    const result = saveableActivityPlanStructureSchemaV2.safeParse(
      createPlan({
        steps: [
          {
            id: stepId,
            name: "Long time",
            duration: {
              type: "time",
              seconds: ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDurationSeconds + 1,
            },
            targets: [{ type: "%FTP", intensity: 301 }],
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Long distance",
            duration: {
              type: "distance",
              meters: ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepDistanceMeters + 1,
            },
            targets: [{ type: "watts", intensity: 3_001 }],
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Many repetitions",
            duration: {
              type: "repetitions",
              count: ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxStepRepetitionCount + 1,
            },
            targets: [{ type: "%FTP", intensity: 75 }],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["intervals", 0, "steps", 0, "duration", "seconds"],
        ["intervals", 0, "steps", 0, "targets", 0, "intensity"],
        ["intervals", 0, "steps", 1, "duration", "meters"],
        ["intervals", 0, "steps", 1, "targets", 0, "intensity"],
        ["intervals", 0, "steps", 2, "duration", "count"],
      ]),
    );
  });

  it("rejects plans whose repetitions expand beyond aggregate limits", () => {
    const steps = Array.from({ length: 20 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
      name: `Step ${index + 1}`,
      duration: { type: "time" as const, seconds: 13_000 },
      targets: [{ type: "%FTP" as const, intensity: 75 }],
    }));
    const plan = createPlan({ repetitions: 50, steps });
    plan.intervals.push({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Extra",
      repetitions: 1,
      steps: steps.slice(0, 1),
    });

    const result = saveableActivityPlanStructureSchemaV2.safeParse(plan);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["intervals"],
          message: `Saved plans cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedStepCount} expanded steps.`,
        }),
        expect.objectContaining({
          path: ["intervals"],
          message: `Saved plans cannot exceed ${ACTIVITY_PLAN_V2_SAVEABLE_LIMITS.maxExpandedDurationSeconds} seconds of expanded duration.`,
        }),
      ]),
    );
  });
});
