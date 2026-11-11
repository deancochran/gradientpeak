import { beforeEach, describe, expect, it, vi } from "vitest";

const drainGarminTrainingSync = vi.fn();
const authorized = vi.fn();

vi.mock("../../../../../lib/garmin-training-sync-worker", () => ({ drainGarminTrainingSync }));
vi.mock("../../../../../lib/internal-provider-sync-auth", () => ({
  isInternalProviderSyncAuthorized: authorized,
}));

describe("Garmin training internal drain route", () => {
  beforeEach(() => {
    authorized.mockReset();
    authorized.mockReturnValue(true);
    drainGarminTrainingSync.mockReset();
  });

  it("does not invoke the worker when the shared secret is unauthorized", async () => {
    authorized.mockReturnValue(false);
    const { Route } = await import("./training-drain");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Garmin drain POST handler");

    const response = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    });

    expect(response.status).toBe(401);
    expect(drainGarminTrainingSync).not.toHaveBeenCalled();
  });

  it("reports unavailable without retrying when Garmin credentials are missing", async () => {
    drainGarminTrainingSync.mockResolvedValue({ alreadyRunning: false, configured: false });
    const { Route } = await import("./training-drain");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Garmin drain POST handler");

    const response = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unavailable" });
    expect(drainGarminTrainingSync).toHaveBeenCalledTimes(1);
  });
});
