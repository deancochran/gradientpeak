import { describe, expect, it } from "vitest";
import { activityPlanCreateFormSchema, activityPlanUpdateFormSchema } from "../form-schemas";
import {
  activityPlanCreateSchema,
  activityPlanInputSchema,
  activityPlanUpdateSchema,
  recordingServiceActivityPlanSchema,
} from "../index";

const structure = {
  version: 3 as const,
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity" as const,
      activity_category: "run" as const,
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
  it("accepts strict V3 create input without top-level activity_category authority", () => {
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

  it("rejects mixed-category structures for create and recording consumers", () => {
    const firstSegment = structure.segments[0];
    if (!firstSegment) throw new Error("missing activity segment fixture");
    const firstInterval = firstSegment.intervals[0];
    if (!firstInterval) throw new Error("missing interval fixture");
    const firstStep = firstInterval.steps[0];
    if (!firstStep) throw new Error("missing step fixture");

    const legacyStructure = {
      ...structure,
      segments: [
        ...structure.segments,
        {
          ...firstSegment,
          id: "00000000-0000-4000-8000-000000000011",
          activity_category: "bike" as const,
          intervals: [
            {
              ...firstInterval,
              id: "00000000-0000-4000-8000-000000000012",
              steps: [
                {
                  ...firstStep,
                  id: "00000000-0000-4000-8000-000000000013",
                },
              ],
            },
          ],
        },
      ],
    };

    expect(
      activityPlanCreateSchema.safeParse({ name: "New plan", structure: legacyStructure }).success,
    ).toBe(false);
    expect(
      recordingServiceActivityPlanSchema.safeParse({
        name: "Legacy checkpoint",
        structure: legacyStructure,
      }).success,
    ).toBe(false);
  });

  it("rejects plan-owned route linkage for create, update, and recording contracts", () => {
    const route_id = "550e8400-e29b-41d4-a716-446655440000";

    expect(
      activityPlanCreateSchema.safeParse({ name: "Route plan", route_id, structure }).success,
    ).toBe(false);
    expect(activityPlanUpdateSchema.safeParse({ route_id }).success).toBe(false);
    expect(
      activityPlanInputSchema.safeParse({ name: "Route plan", route_id, structure }).success,
    ).toBe(false);
    expect(
      recordingServiceActivityPlanSchema.safeParse({ name: "Route plan", route_id, structure })
        .success,
    ).toBe(false);
  });
});

describe("activity plan form schema composition", () => {
  it("uses the same strict structure contract", () => {
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
        name: "Old activity_category input",
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

  it("rejects plan-owned route linkage in strict form contracts", () => {
    const route_id = "550e8400-e29b-41d4-a716-446655440000";

    expect(
      activityPlanCreateFormSchema.safeParse({ name: "Route plan", route_id, structure }).success,
    ).toBe(false);
    expect(activityPlanUpdateFormSchema.safeParse({ id: route_id, route_id }).success).toBe(false);
  });
});
