import { describe, expect, it } from "vitest";
import {
  type ActivityPlanStructureV2,
  activityPlanCreateSchema,
  activityPlanUpdateSchema,
  activityTargetCapabilityConfig,
  getActivityTargetCompatibilityIssues,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "../index";

function createStructure(
  targets: ActivityPlanStructureV2["intervals"][number]["steps"][number]["targets"],
): ActivityPlanStructureV2 {
  return {
    version: 2,
    intervals: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Interval",
        repetitions: 1,
        steps: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Step",
            duration: { type: "time", seconds: 600 },
            targets,
          },
        ],
      },
    ],
  };
}

describe("activity target capabilities", () => {
  it("defines permissible targets for every activity category", () => {
    expect(Object.keys(activityTargetCapabilityConfig).sort()).toEqual([
      "bike",
      "other",
      "run",
      "strength",
      "swim",
    ]);

    expect(getPermissibleTargetTypes("run")).not.toContain("%FTP");
    expect(getPermissibleTargetTypes("swim")).not.toContain("watts");
    expect(getPermissibleTargetTypes("strength")).toEqual(["RPE"]);
  });

  it("reports contextual target compatibility issues with precise paths", () => {
    const issues = getActivityTargetCompatibilityIssues({
      activityCategory: "run",
      pathPrefix: ["structure"],
      structure: createStructure([{ type: "%FTP", intensity: 80 }]),
    });

    expect(issues).toEqual([
      {
        activityCategory: "run",
        targetType: "%FTP",
        path: ["structure", "intervals", 0, "steps", 0, "targets", 0, "type"],
        message:
          "Target type %FTP is not permitted for run activity plans. Allowed targets: bpm, %MaxHR, %ThresholdHR, speed, cadence, RPE.",
      },
    ]);
  });

  it("enforces activity target compatibility in activity plan create schemas", () => {
    expect(
      activityPlanCreateSchema.safeParse({
        activity_category: "run",
        name: "Invalid Run Power",
        structure: createStructure([{ type: "watts", intensity: 250 }]),
      }).success,
    ).toBe(false);

    expect(
      activityPlanCreateSchema.safeParse({
        activity_category: "bike",
        name: "Valid Bike Power",
        structure: createStructure([{ type: "%FTP", intensity: 80 }]),
      }).success,
    ).toBe(true);

    expect(
      activityPlanCreateSchema.safeParse({
        activity_category: "bike",
        name: "Valid Bike Power Without Description",
        description: null,
        structure: createStructure([{ type: "%FTP", intensity: 80 }]),
      }).success,
    ).toBe(true);

    expect(
      isTargetTypePermittedForActivity({ activityCategory: "swim", targetType: "watts" }),
    ).toBe(false);
  });

  it("validates update schemas when both activity category and structure are present", () => {
    const result = activityPlanUpdateSchema.safeParse({
      activity_category: "swim",
      structure: createStructure([{ type: "watts", intensity: 200 }]),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "structure",
      "intervals",
      0,
      "steps",
      0,
      "targets",
      0,
      "type",
    ]);
  });
});
