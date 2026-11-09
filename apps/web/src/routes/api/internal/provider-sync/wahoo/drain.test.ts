import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processDueJobs = vi.fn().mockResolvedValue({ completed: 1, failed: 0, processed: 1 });
const createWahooSyncRuntime = vi.fn(() => ({
  activityHistoryJobs: { processDueJobs },
  syncJobs: { processDueJobs },
  webhookJobs: { processDueJobs },
}));
const isWahooIntegrationEnabled = vi.fn(() => true);
let registeredWorker: () => Promise<unknown>;
const getWorker = vi.fn(() => registeredWorker);
const authorized = vi.fn(() => true);

vi.mock("../../../../../lib/internal-provider-sync-auth", () => ({
  isInternalProviderSyncAuthorized: authorized,
}));
vi.mock("../../../../../lib/wahoo-sync-runtime", () => ({
  createAthleteStateRuntime: () => ({ athleteStateJobs: { processDueJobs } }),
  createWahooSyncRuntime,
  getWahooDrainConfig: () => ({ concurrency: 3, leaseMs: 60_000, limit: 3 }),
  isWahooIntegrationEnabled,
}));
vi.mock("../../../../../lib/provider-worker-registry", () => ({
  providerWorkerRegistry: { get: getWorker },
}));

describe("Wahoo internal drain route", () => {
  beforeEach(async () => {
    processDueJobs.mockClear();
    createWahooSyncRuntime.mockClear();
    isWahooIntegrationEnabled.mockReturnValue(true);
    authorized.mockReset();
    authorized.mockReturnValue(true);
    getWorker.mockClear();
    getWorker.mockImplementation(() => registeredWorker);
    registeredWorker = (await import("../../../../../lib/wahoo-sync-worker"))
      .drainWahooProviderSync;
  });

  it("is the sole production owner and drains the sync family that owns disconnect jobs", async () => {
    const [{ Route }, routeSource, workerSource, directSource, schedulerSource] = await Promise.all(
      [
        import("./drain"),
        readFile(new URL("./drain.ts", import.meta.url), "utf8"),
        readFile(new URL("../../../../../lib/wahoo-sync-worker.ts", import.meta.url), "utf8"),
        readFile(
          new URL("../../../../../../scripts/drain-wahoo-provider-sync-direct.ts", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL("../../../../../../scripts/drain-provider-sync.mjs", import.meta.url),
          "utf8",
        ),
      ],
    );

    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Wahoo drain POST handler");
    const response = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    } as never);

    expect(await response.json()).toEqual({
      activityHistoryJobs: { completed: 1, failed: 0, processed: 1 },
      athleteStateJobs: { completed: 1, failed: 0, processed: 1 },
      provider: "wahoo",
      syncJobs: { completed: 1, failed: 0, processed: 1 },
      webhookJobs: { completed: 1, failed: 0, processed: 1 },
    });
    expect(processDueJobs).toHaveBeenCalledWith(
      expect.objectContaining({ workerId: "api-internal-wahoo-drain" }),
    );
    expect(routeSource).toContain("providerWorkerRegistry");
    expect(workerSource.match(/processDueJobs\(/g)).toHaveLength(4);
    expect(directSource).toContain('WAHOO_DIRECT_DRAIN_LOCAL !== "true"');
    expect(directSource).toContain('NODE_ENV !== "development"');
    expect(directSource).toContain('fetch(new URL("/api/internal/provider-sync/wahoo/drain"');
    expect(directSource).not.toContain("createWahooSyncRuntime");
    expect(directSource).not.toContain("processDueJobs");
    expect(schedulerSource).toContain("WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS, DEFAULT_INTERVAL_MS");
    expect(schedulerSource).toContain("garmin/training-drain");
    expect(schedulerSource).toContain("await sleep(hasConnected ? config.intervalMs");
  });

  it("keeps athlete-state draining while Wahoo provider work is disabled", async () => {
    isWahooIntegrationEnabled.mockReturnValue(false);
    const { Route } = await import("./drain");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Wahoo drain POST handler");

    const response = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    } as never);

    expect(await response.json()).toEqual({
      activityHistoryJobs: { completed: 0, failed: 0, processed: 0 },
      athleteStateJobs: { completed: 1, failed: 0, processed: 1 },
      provider: "wahoo",
      syncJobs: { completed: 0, failed: 0, processed: 0 },
      webhookJobs: { completed: 0, failed: 0, processed: 0 },
    });
    expect(createWahooSyncRuntime).not.toHaveBeenCalled();
    expect(processDueJobs).toHaveBeenCalledTimes(1);
  });

  it("fails closed before invoking unavailable or unauthorized workers", async () => {
    const { Route } = await import("./drain");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Wahoo drain POST handler");

    authorized.mockReturnValue(false);
    const unauthorized = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    });
    expect(unauthorized.status).toBe(401);
    expect(getWorker).not.toHaveBeenCalled();

    authorized.mockReturnValue(true);
    getWorker.mockReturnValueOnce(null as never);
    const unavailable = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    });
    expect(unavailable.status).toBe(503);
  });

  it("reports an already-running certified worker", async () => {
    getWorker.mockReturnValueOnce(async () => ({ alreadyRunning: true }));
    const { Route } = await import("./drain");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Wahoo drain POST handler");

    const response = await handler({
      request: new Request("http://test/drain", { method: "POST" }),
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ provider: "wahoo", status: "already_running" });
  });
});
