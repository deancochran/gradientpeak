import { describe, expect, it } from "vitest";

import { createActivityPlanSchema, updateActivityPlanSchema } from "../activity_plan_structure";
import { activityPlanCreateFormSchema, activityPlanUpdateFormSchema } from "../form-schemas";

describe("activity plan schema composition", () => {
  it("keeps create activity plans subject to plan-level refinement", () => {
    const result = createActivityPlanSchema.safeParse({
      name: "Tempo builder",
      description: "",
      activity_category: "bike",
      structure: {},
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["structure"],
          message: "Plan must have steps, route, or both",
        }),
      ]),
    );
  });

  it("allows partial activity plan updates without reapplying create refinement", () => {
    expect(
      updateActivityPlanSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Updated tempo builder",
      }),
    ).toMatchObject({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Updated tempo builder",
    });
  });
});

describe("activity plan form schema composition", () => {
  it("requires saveable structure when creating an activity plan form", () => {
    const result = activityPlanCreateFormSchema.safeParse({
      name: "Evening run",
      description: "",
      activity_category: "run",
      notes: null,
      structure: {
        version: 2,
        intervals: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Main Set",
            repetitions: 1,
            steps: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Run",
                duration: { type: "untilFinished" },
                targets: [],
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["structure", "intervals", 0, "steps", 0, "duration"],
          message:
            "Saved steps need an explicit time, distance, or repetitions duration. 'Until finished' cannot produce trustworthy IF/TSS.",
        }),
        expect.objectContaining({
          path: ["structure", "intervals", 0, "steps", 0, "targets"],
          message: "Each saved step needs an intensity target.",
        }),
      ]),
    );
  });

  it("allows partial activity plan form updates without create-only refinement", () => {
    expect(
      activityPlanUpdateFormSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Updated evening run",
      }),
    ).toMatchObject({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Updated evening run",
    });
  });
});
