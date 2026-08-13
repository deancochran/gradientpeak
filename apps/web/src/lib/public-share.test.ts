import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  activityPlan: vi.fn(),
  createApiContext: vi.fn(),
  createCaller: vi.fn(),
  trainingPlan: vi.fn(),
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

import { loadPublicActivity, loadPublicActivityPlan, loadPublicTrainingPlan } from "./public-share";

const validId = "00000000-0000-4000-8000-000000000001";

describe("public share loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createApiContext.mockResolvedValue({});
    mocks.createCaller.mockReturnValue({
      publicShare: {
        activity: mocks.activity,
        activityPlan: mocks.activityPlan,
        trainingPlan: mocks.trainingPlan,
      },
    });
    mocks.activity.mockResolvedValue(null);
    mocks.activityPlan.mockResolvedValue(null);
    mocks.trainingPlan.mockResolvedValue(null);
  });

  it.each([
    ["activity", loadPublicActivity],
    ["activity plan", loadPublicActivityPlan],
    ["training plan", loadPublicTrainingPlan],
  ])("rejects malformed %s input before creating a caller", async (_name, load) => {
    await expect(load({ data: { id: "not-a-uuid" } as never })).rejects.toThrow();

    expect(mocks.createApiContext).not.toHaveBeenCalled();
    expect(mocks.createCaller).not.toHaveBeenCalled();
  });

  it("passes valid UUID input to each public share procedure", async () => {
    await expect(loadPublicActivity({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicActivityPlan({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicTrainingPlan({ data: { id: validId } })).resolves.toBeNull();

    expect(mocks.activity).toHaveBeenCalledWith({ id: validId });
    expect(mocks.activityPlan).toHaveBeenCalledWith({ id: validId });
    expect(mocks.trainingPlan).toHaveBeenCalledWith({ id: validId });
    expect(mocks.createCaller).toHaveBeenCalledTimes(3);
  });
});
