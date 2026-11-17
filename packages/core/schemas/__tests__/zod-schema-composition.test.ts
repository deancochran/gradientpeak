import { describe, expect, it } from "vitest";
import { activityPlanCreateFormSchema, activityPlanUpdateFormSchema } from "../form-schemas";
import {
  activityPlanCreateSchema,
  activityPlanInputSchema,
  activityPlanUpdateSchema,
  recordingServiceActivityPlanSchema,
} from "../index";

const structure = {
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Run",
      duration: { type: "untilFinished" as const },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
  ],
};
describe("activity plan schema composition", () => {
  it("accepts strict V5 create input with root activity_category authority", () => {
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
    const firstStep = structure.items[0];
    if (!firstStep || firstStep.type !== "step") throw new Error("missing step fixture");
    const invalidStructure = {
      ...structure,
      items: [
        ...structure.items,
        {
          id: "00000000-0000-4000-8000-000000000011",
          type: "step" as const,
          duration: firstStep.duration,
          targets: [{ type: "watts" as const, intensity: 200 }],
        },
      ],
    };
    expect(
      activityPlanCreateSchema.safeParse({ name: "New plan", structure: invalidStructure }).success,
    ).toBe(false);
    expect(
      recordingServiceActivityPlanSchema.safeParse({
        name: "Legacy checkpoint",
        structure: invalidStructure,
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
