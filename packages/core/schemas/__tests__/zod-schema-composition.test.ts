import { describe, expect, it } from "vitest";
import { activityPlanCreateFormSchema, activityPlanUpdateFormSchema } from "../form-schemas";
import { activityPlanCreateSchema, activityPlanUpdateSchema } from "../index";

const structure = {
  version: 3 as const,
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity" as const,
      category: "run" as const,
      name: "Run",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Main Set",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              name: "Run",
              duration: { type: "untilFinished" as const },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("activity plan schema composition", () => {
  it("accepts strict V3 create input without top-level category authority", () => {
    expect(activityPlanCreateSchema.safeParse({ name: "Tempo builder", structure }).success).toBe(
      true,
    );
    expect(
      activityPlanCreateSchema.safeParse({
        name: "Old input",
        structure: { version: 2, intervals: [] },
      }).success,
    ).toBe(false);
  });

  it("allows partial activity plan updates", () => {
    expect(activityPlanUpdateSchema.parse({ name: "Updated tempo builder" })).toEqual({
      name: "Updated tempo builder",
    });
  });
});

describe("activity plan form schema composition", () => {
  it("uses the same strict V3 structure contract", () => {
    expect(
      activityPlanCreateFormSchema.safeParse({
        name: "Evening run",
        description: "",
        notes: null,
        structure,
      }).success,
    ).toBe(true);
    expect(
      activityPlanCreateFormSchema.safeParse({
        name: "Old category input",
        activity_category: "run",
        notes: null,
        structure,
      }).success,
    ).toBe(false);
  });

  it("allows partial form updates", () => {
    expect(
      activityPlanUpdateFormSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Updated evening run",
      }),
    ).toMatchObject({ name: "Updated evening run" });
  });
});
