import { describe, expect, it } from "vitest";

import {
  createActivityPlanSchema,
  updateActivityPlanSchema,
} from "../activity_plan_structure";
import {
  activityPlanCreateFormSchema,
  activityPlanUpdateFormSchema,
} from "../form-schemas";

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
  it("requires structure or route when creating an activity plan form", () => {
    const result = activityPlanCreateFormSchema.safeParse({
      name: "Evening run",
      description: "",
      activity_category: "run",
      notes: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["structure"],
          message: "Activity plan must have either a structure or a route",
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
