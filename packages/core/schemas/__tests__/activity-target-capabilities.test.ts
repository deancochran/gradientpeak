import { describe, expect, it } from "vitest";
import {
  type ActivityPlanStructureV3,
  type ActivityTarget,
  activityPlanCreateSchema,
  activityPlanStructureSchemaV3,
  activityPlanUpdateSchema,
  activityTargetCapabilityConfig,
  getActivityTargetCompatibilityIssues,
  getPermissibleTargetTypes,
  isTargetTypePermittedForActivity,
} from "../index";

function createStructure(
  targets: ActivityTarget[],
  category: "run" | "bike" | "swim" = "run",
): ActivityPlanStructureV3 {
  return activityPlanStructureSchemaV3.parse({
    version: 3,
    segments: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        role: "activity",
        category,
        name: "Activity",
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
      },
    ],
  });
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

  it("accepts a strictly validated V3 structure without duplicate compatibility issues", () => {
    const issues = getActivityTargetCompatibilityIssues({
      pathPrefix: ["structure"],
      structure: createStructure([{ type: "%MaxHR", intensity: 80 }]),
    });

    expect(issues).toEqual([]);
  });

  it("enforces activity target compatibility in activity plan create schemas", () => {
    expect(
      activityPlanCreateSchema.safeParse({
        name: "Invalid Run Power",
        structure: {
          version: 3,
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              category: "run",
              name: "Run",
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
                      targets: [{ type: "watts", intensity: 250 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Valid Bike Power",
        structure: createStructure([{ type: "%FTP", intensity: 80 }], "bike"),
      }).success,
    ).toBe(true);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Valid Bike Power Without Description",
        description: null,
        structure: createStructure([{ type: "%FTP", intensity: 80 }], "bike"),
      }).success,
    ).toBe(true);

    expect(
      isTargetTypePermittedForActivity({ activityCategory: "swim", targetType: "watts" }),
    ).toBe(false);
  });

  it("validates update schemas from segment-owned category authority", () => {
    const result = activityPlanUpdateSchema.safeParse({
      structure: {
        version: 3,
        segments: [
          {
            ...createStructure([{ type: "RPE", intensity: 5 }], "swim").segments[0],
            intervals: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "Bad",
                repetitions: 1,
                steps: [
                  {
                    id: "22222222-2222-4222-8222-222222222222",
                    name: "Bad",
                    duration: { type: "time", seconds: 60 },
                    targets: [{ type: "watts", intensity: 200 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "structure",
      "segments",
      0,
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
