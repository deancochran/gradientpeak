import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processDueJobs = vi.fn().mockResolvedValue({ completed: 1, failed: 0, processed: 1 });
const createWahooSyncRuntime = vi.fn(() => ({
  activityHistoryJobs: { processDueJobs },
  syncJobs: { processDueJobs },
  webhookJobs: { processDueJobs },
}));
const isWahooIntegrationEnabled = vi.fn(() => true);

vi.mock("../../../../../lib/internal-provider-sync-auth", () => ({
  isInternalProviderSyncAuthorized: () => true,
}));
vi.mock("../../../../../lib/wahoo-sync-runtime", () => ({
  createAthleteStateRuntime: () => ({ athleteStateJobs: { processDueJobs } }),
  createWahooSyncRuntime,
  getWahooDrainConfig: () => ({ concurrency: 3, leaseMs: 60_000, limit: 3 }),
  isWahooIntegrationEnabled,
}));

describe("Wahoo internal drain route", () => {
  beforeEach(() => {
    processDueJobs.mockClear();
    createWahooSyncRuntime.mockClear();
    isWahooIntegrationEnabled.mockReturnValue(true);
  });

  it("is the sole production owner and drains the sync family that owns disconnect jobs", async () => {
    const [{ Route }, routeSource, directSource, schedulerSource] = await Promise.all([
      import("./drain"),
      readFile(new URL("./drain.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../../scripts/drain-wahoo-provider-sync-direct.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../../../../scripts/drain-wahoo-provider-sync.mjs", import.meta.url),
        "utf8",
      ),
    ]);

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
    expect(routeSource.match(/processDueJobs\(/g)).toHaveLength(4);
    expect(directSource).toContain('WAHOO_DIRECT_DRAIN_LOCAL !== "true"');
    expect(directSource).toContain('NODE_ENV !== "development"');
    expect(directSource).toContain('fetch(new URL("/api/internal/provider-sync/wahoo/drain"');
    expect(directSource).not.toContain("createWahooSyncRuntime");
    expect(directSource).not.toContain("processDueJobs");
    expect(schedulerSource).toContain('WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS ?? "5000"');
    expect(schedulerSource).toContain("await drain()");
    expect(schedulerSource.indexOf("await drain()")).toBeLessThan(
      schedulerSource.indexOf("setTimeout(resolve"),
    );
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
});
