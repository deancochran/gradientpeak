import { createMobileProviderActionRegistry } from "./integration-provider-actions";

describe("mobile provider action registry", () => {
  it("dispatches synthetic connect and disconnect handlers without route branches", async () => {
    const connect = jest.fn(async () => undefined);
    const disconnect = jest.fn(async () => undefined);
    const syncNow = jest.fn(async () => undefined);
    const refreshSetupData = jest.fn(async () => undefined);
    const registry = createMobileProviderActionRegistry<
      "synthetic",
      undefined,
      {
        provider: "synthetic";
        connect: () => Promise<void>;
        disconnect: () => Promise<void>;
        sync_now: () => Promise<void>;
        refresh_setup_data: () => Promise<void>;
      }
    >([
      {
        provider: "synthetic",
        connect,
        disconnect,
        sync_now: syncNow,
        refresh_setup_data: refreshSetupData,
      },
    ]);

    await registry.dispatch("synthetic", "connect", undefined);
    await registry.dispatch("synthetic", "disconnect", undefined);
    await registry.dispatch("synthetic", "sync_now", undefined);
    await registry.dispatch("synthetic", "refresh_setup_data", undefined);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(refreshSetupData).toHaveBeenCalledTimes(1);
  });

  it("fails safely when a handler is missing", async () => {
    const registry = createMobileProviderActionRegistry<"synthetic", undefined, never>([]);
    await expect(registry.dispatch("synthetic", "sync_now", undefined)).rejects.toThrow(
      /unavailable/i,
    );
  });
});
