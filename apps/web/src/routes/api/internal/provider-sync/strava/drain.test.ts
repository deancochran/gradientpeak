import { beforeEach, describe, expect, it, vi } from "vitest";

const authorized = vi.fn(() => true);
const drain = vi.fn(async () => ({ alreadyRunning: false, result: { provider: "strava" } }));
const getWorker = vi.fn((): (() => Promise<unknown>) | null => drain);

vi.mock("../../../../../lib/internal-provider-sync-auth", () => ({
  isInternalProviderSyncAuthorized: authorized,
}));
vi.mock("../../../../../lib/provider-worker-registry", () => ({
  providerWorkerRegistry: { get: getWorker },
}));

describe("Strava internal drain route", () => {
  beforeEach(() => {
    authorized.mockReset();
    authorized.mockReturnValue(true);
    drain.mockReset();
    drain.mockResolvedValue({ alreadyRunning: false, result: { provider: "strava" } });
    getWorker.mockReset();
    getWorker.mockReturnValue(drain);
  });

  async function post() {
    const { Route } = await import("./drain");
    const handler = (
      Route.options as unknown as {
        server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } };
      }
    ).server.handlers.POST;
    return handler({ request: new Request("http://test/drain", { method: "POST" }) });
  }

  it("requires internal authorization and invokes the certified shared worker", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ provider: "strava" });
    expect(drain).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized requests before resolving or invoking a worker", async () => {
    authorized.mockReturnValue(false);
    const response = await post();
    expect(response.status).toBe(401);
    expect(getWorker).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();
  });

  it("returns unavailable when the certified worker cannot be resolved", async () => {
    getWorker.mockReturnValue(null);
    const response = await post();
    expect(response.status).toBe(503);
    expect(drain).not.toHaveBeenCalled();
  });

  it("reports an already-running drain without starting another result response", async () => {
    drain.mockResolvedValue({ alreadyRunning: true } as never);
    const response = await post();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ provider: "strava", status: "already_running" });
  });
});
