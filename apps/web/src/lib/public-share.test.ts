import type { TrainingPlan } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  createApiContext: vi.fn(),
  createCaller: vi.fn(),
  trainingPlan: vi.fn(),
  workout: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (input: unknown) => unknown }) => ({
      handler:
        (handler: (context: { data: never }) => unknown) =>
        async ({ data }: { data: unknown }) =>
          handler({ data: schema.parse(data) as never }),
    }),
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ host: "example.test" }),
}));

vi.mock("@repo/api/server", () => ({
  appRouter: { createCaller: mocks.createCaller },
  createApiContext: mocks.createApiContext,
}));

vi.mock("@repo/db/client", () => ({ db: {} }));

import {
  loadPublicActivity,
  loadPublicTrainingPlan,
  loadPublicWorkout,
  projectPublicTrainingPlanStructure,
} from "./public-share";

const validId = "00000000-0000-4000-8000-000000000001";

const baseStructure: TrainingPlan = {
  id: validId,
  version: 1,
  sessions: [
    {
      activity_plan_id: "00000000-0000-4000-8000-000000000002",
      offset_days: 0,
    },
  ],
};

describe("public share loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApiContext.mockResolvedValue({});
    mocks.createCaller.mockReturnValue({
      publicShare: {
        activity: mocks.activity,
        trainingPlan: mocks.trainingPlan,
        workout: mocks.workout,
      },
    });
    mocks.activity.mockResolvedValue(null);
    mocks.trainingPlan.mockResolvedValue(null);
    mocks.workout.mockResolvedValue(null);
  });

  it.each([
    ["activity", loadPublicActivity],
    ["workout", loadPublicWorkout],
    ["training plan", loadPublicTrainingPlan],
  ])("rejects malformed %s input before creating a caller", async (_name, load) => {
    await expect(load({ data: { id: "not-a-uuid" } as never })).rejects.toThrow();

    expect(mocks.createApiContext).not.toHaveBeenCalled();
    expect(mocks.createCaller).not.toHaveBeenCalled();
  });

  it("passes valid UUID input to each public share procedure", async () => {
    await expect(loadPublicActivity({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicWorkout({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicTrainingPlan({ data: { id: validId } })).resolves.toBeNull();

    expect(mocks.activity).toHaveBeenCalledWith({ id: validId });
    expect(mocks.workout).toHaveBeenCalledWith({ id: validId });
    expect(mocks.trainingPlan).toHaveBeenCalledWith({ id: validId });
    expect(mocks.createCaller).toHaveBeenCalledTimes(3);
  });
});

describe("projectPublicTrainingPlanStructure", () => {
  it("preserves serializable goal objectives", () => {
    const projected = projectPublicTrainingPlanStructure({
      ...baseStructure,
      goal_blueprints: [
        {
          objective: {
            distance_m: 10_000,
            labels: ["priority", null],
            type: "event_performance",
          },
          priority: 9,
          title: "10K race",
        },
      ],
    });

    expect(projected.goal_blueprints?.[0]?.objective).toEqual({
      distance_m: 10_000,
      labels: ["priority", null],
      type: "event_performance",
    });
  });

  it("omits unsupported opaque objective values", () => {
    const projected = projectPublicTrainingPlanStructure({
      ...baseStructure,
      goal_blueprints: [
        {
          objective: new Date("2026-07-17T00:00:00.000Z"),
          priority: 5,
          title: "Opaque objective",
        },
      ],
    });

    expect(projected.goal_blueprints?.[0]).toEqual({
      priority: 5,
      title: "Opaque objective",
    });
    expect(projected.goal_blueprints?.[0]).not.toHaveProperty("objective");
  });
});
