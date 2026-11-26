import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  activityPlan: vi.fn(),
  createApiContext: vi.fn(),
  createCaller: vi.fn(),
  trainingPlan: vi.fn(),
  route: vi.fn(),
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
  getRequestHeaders: () =>
    new Headers({
      host: "request.example.test",
      "x-forwarded-host": "forwarded.example.test",
      "x-forwarded-proto": "http",
    }),
}));

vi.mock("@repo/api/server", () => ({
  appRouter: { createCaller: mocks.createCaller },
  createApiContext: mocks.createApiContext,
}));

vi.mock("@repo/db/client", () => ({ db: {} }));

import {
  loadPublicActivity,
  loadPublicActivityPlan,
  loadPublicRoute,
  loadPublicTrainingPlan,
} from "./public-share";

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
        route: mocks.route,
      },
    });
    mocks.activity.mockResolvedValue(null);
    mocks.activityPlan.mockResolvedValue(null);
    mocks.trainingPlan.mockResolvedValue(null);
    mocks.route.mockResolvedValue(null);
    vi.stubEnv("APP_URL", "https://app.example.test");
  });

  it.each([
    ["activity", loadPublicActivity],
    ["activity plan", loadPublicActivityPlan],
    ["training plan", loadPublicTrainingPlan],
    ["route", loadPublicRoute],
  ])("rejects malformed %s input before creating a caller", async (_name, load) => {
    await expect(load({ data: { id: "not-a-uuid" } as never })).rejects.toThrow();

    expect(mocks.createApiContext).not.toHaveBeenCalled();
    expect(mocks.createCaller).not.toHaveBeenCalled();
  });

  it("passes valid UUID input to each public share procedure", async () => {
    await expect(loadPublicActivity({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicActivityPlan({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicTrainingPlan({ data: { id: validId } })).resolves.toBeNull();
    await expect(loadPublicRoute({ data: { id: validId } })).resolves.toBeNull();

    expect(mocks.activity).toHaveBeenCalledWith({ id: validId });
    expect(mocks.activityPlan).toHaveBeenCalledWith({ id: validId });
    expect(mocks.trainingPlan).toHaveBeenCalledWith({ id: validId });
    expect(mocks.route).toHaveBeenCalledWith({ id: validId });
    expect(mocks.createCaller).toHaveBeenCalledTimes(4);
  });

  it("uses the configured app origin for canonical URLs rather than request forwarding headers", async () => {
    mocks.activity.mockResolvedValue({ id: validId });

    await expect(loadPublicActivity({ data: { id: validId } })).resolves.toEqual({
      activity: { id: validId },
      canonicalUrl: `https://app.example.test/share/activities/${validId}`,
    });
  });
});
