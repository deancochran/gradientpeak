import { describe, expect, it, vi } from "vitest";
import { WahooSyncService } from "./sync-service";

describe("WahooSyncService planned-workout capability fence", () => {
  it("fails closed before any sync lookup or mutation", async () => {
    const repository = new Proxy({}, { get: () => vi.fn() });
    const storage = { downloadRouteGpx: vi.fn() };
    const service = new WahooSyncService({ repository: repository as never, storage });

    await expect(service.syncEvent("event", "profile")).resolves.toMatchObject({
      failureCode: "capability_disabled",
      retryable: false,
      success: false,
    });
    expect(storage.downloadRouteGpx).not.toHaveBeenCalled();
    expect(Object.values(repository)).toHaveLength(0);
  });

  it("fails closed before any unsync lookup or mutation", async () => {
    const repository = new Proxy({}, { get: () => vi.fn() });
    const storage = { downloadRouteGpx: vi.fn() };
    const service = new WahooSyncService({ repository: repository as never, storage });

    await expect(service.unsyncEvent("event", "profile")).resolves.toMatchObject({
      failureCode: "capability_disabled",
      retryable: false,
      success: false,
    });
    expect(storage.downloadRouteGpx).not.toHaveBeenCalled();
    expect(Object.values(repository)).toHaveLength(0);
  });
});
