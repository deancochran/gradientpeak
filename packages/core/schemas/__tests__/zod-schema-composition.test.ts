import { describe, expect, it } from "vitest";

import { createActivityPlanSchema, updateActivityPlanSchema } from "../activity_plan_structure";
import { activityPlanCreateFormSchema, activityPlanUpdateFormSchema } from "../form-schemas";
import { activityPlanCreateSchema } from "../index";

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

  it("rejects route-backed structures with distance-based steps", () => {
    const result = activityPlanCreateSchema.safeParse({
      name: "Climb Builder",
      description: "",
      activity_category: "bike",
      route_id: "550e8400-e29b-41d4-a716-446655440000",
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
                name: "Push",
                duration: { type: "distance", meters: 1000 },
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
            "Route-guided plans cannot use distance-based step durations because the route already defines spatial progress.",
        }),
      ]),
    );
  });

  it("rejects route-backed structures with speed targets", () => {
    const result = activityPlanCreateSchema.safeParse({
      name: "Tempo Route",
      description: "",
      activity_category: "run",
      route_id: "550e8400-e29b-41d4-a716-446655440000",
      structure: {
        version: 2,
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Tempo",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Tempo",
                duration: { type: "time", seconds: 600 },
                targets: [{ type: "speed", intensity: 4.5 }],
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
          path: ["structure", "intervals", 0, "steps", 0, "targets", 0],
          message:
            "Route-guided plans cannot use speed targets because route simulation owns spatial guidance.",
        }),
      ]),
    );
  });

  it("allows route-backed structures with non-spatial targets", () => {
    const result = activityPlanCreateSchema.safeParse({
      name: "Climbing Intervals",
      description: "",
      activity_category: "bike",
      route_id: "550e8400-e29b-41d4-a716-446655440000",
      structure: {
        version: 2,
        intervals: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Climb",
            repetitions: 1,
            steps: [
              {
                id: "66666666-6666-4666-8666-666666666666",
                name: "Threshold",
                duration: { type: "time", seconds: 900 },
                targets: [{ type: "watts", intensity: 250 }],
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects steps with multiple trainer-controllable targets", () => {
    const result = activityPlanCreateSchema.safeParse({
      name: "Mixed Control",
      description: "",
      activity_category: "bike",
      structure: {
        version: 2,
        intervals: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                name: "Conflict",
                duration: { type: "time", seconds: 300 },
                targets: [
                  { type: "watts", intensity: 240 },
                  { type: "cadence", intensity: 95 },
                ],
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
          message:
            "Step targets can include at most one trainer-controllable target because automatic trainer control needs a single authority.",
        }),
      ]),
    );
  });

  it("rejects duplicate target families in the same step", () => {
    const result = activityPlanCreateSchema.safeParse({
      name: "Duplicate Power",
      description: "",
      activity_category: "bike",
      structure: {
        version: 2,
        intervals: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                name: "Conflict",
                duration: { type: "time", seconds: 300 },
                targets: [
                  { type: "%FTP", intensity: 95 },
                  { type: "watts", intensity: 250 },
                ],
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
          message: "Step targets cannot include multiple power targets.",
        }),
      ]),
    );
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

  it("rejects route-backed form payloads with spatial structure conflicts", () => {
    const result = activityPlanCreateFormSchema.safeParse({
      name: "Route Tempo",
      description: "",
      activity_category: "run",
      notes: null,
      route_id: "550e8400-e29b-41d4-a716-446655440000",
      structure: {
        version: 2,
        intervals: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "88888888-8888-4888-8888-888888888888",
                name: "Tempo",
                duration: { type: "distance", meters: 1600 },
                targets: [{ type: "speed", intensity: 4.8 }],
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
        }),
        expect.objectContaining({
          path: ["structure", "intervals", 0, "steps", 0, "targets", 0],
        }),
      ]),
    );
  });
});
