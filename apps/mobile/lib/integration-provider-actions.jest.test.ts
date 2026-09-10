import { readFileSync } from "node:fs";
import {
  type ProviderManifest,
  providerManifestRegistry,
  stravaProviderManifest,
} from "@repo/core";
import {
  bindMobileProviderConnectionOperations,
  connectMobileProviderFromManifest,
  connectProductionMobileProvider,
  createMobileProviderActionRegistry,
  productionMobileProviderActionRegistry,
} from "./integration-provider-actions";

const compileOnlyCapabilities = {
  profile_enrichment_read: { status: "unsupported", reason: "Compile-only fixture." },
  activity_history_read: { status: "unsupported", reason: "Compile-only fixture." },
  activity_file_download: { status: "unsupported", reason: "Compile-only fixture." },
  activity_file_format_fit: { status: "unsupported", reason: "Compile-only fixture." },
  completed_activity_export: { status: "unsupported", reason: "Compile-only fixture." },
  planned_activity_push: { status: "unsupported", reason: "Compile-only fixture." },
  route_push: { status: "unsupported", reason: "Compile-only fixture." },
  webhook_activity_updates: { status: "unsupported", reason: "Compile-only fixture." },
} as const satisfies ProviderManifest["capabilities"];

const syntheticDeviceManifest = {
  ...stravaProviderManifest,
  id: "synthetic-device",
  connectorId: "synthetic-device",
  defaultSourceId: "synthetic-device",
  connection: { kind: "device_permissions" },
  execution: "mobile",
  capabilities: compileOnlyCapabilities,
  runtimeOperations: [],
  actions: [],
  workerRequirements: [],
} as const satisfies ProviderManifest<
  "synthetic-device",
  "synthetic-device",
  { kind: "device_permissions" },
  "mobile"
>;

function compileTimeConnectionRequirements() {
  bindMobileProviderConnectionOperations(stravaProviderManifest, {
    // @ts-expect-error OAuth connectors require connectOAuth, not device-permission operations.
    requestDevicePermissions: async () => undefined,
  });
}

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

  it("registers every executable connector from the Core manifest without a local provider list", () => {
    expect(providerManifestRegistry.map((manifest) => manifest.connectorId)).toEqual([
      "wahoo",
      "strava",
    ]);
    for (const manifest of providerManifestRegistry) {
      expect(productionMobileProviderActionRegistry.get(manifest.connectorId)).not.toBeNull();
    }
  });

  it("binds a device-permission connector with only mobile permission operations", async () => {
    const requestDevicePermissions = jest.fn(async () => undefined);
    const runtime = bindMobileProviderConnectionOperations(syntheticDeviceManifest, {
      requestDevicePermissions,
    });
    expect(compileTimeConnectionRequirements).toBeDefined();
    expect(runtime.kind).toBe("device_permissions");
    await runtime.operations.requestDevicePermissions();
    expect(requestDevicePermissions).toHaveBeenCalledTimes(1);
    expect("connectOAuth" in runtime.operations).toBe(false);
  });

  it("connects a device-permission manifest without an OAuth operation", async () => {
    const requestDevicePermissions = jest.fn(async () => undefined);
    await connectMobileProviderFromManifest(syntheticDeviceManifest, {
      requestDevicePermissions,
    });
    expect(requestDevicePermissions).toHaveBeenCalledWith("synthetic-device");
  });

  it("dispatches current OAuth connection behavior from the manifest descriptor", async () => {
    const connectOAuth = jest.fn(async () => undefined);
    await connectProductionMobileProvider("wahoo", { connectOAuth });
    await connectProductionMobileProvider("strava", { connectOAuth });
    expect(connectOAuth.mock.calls).toEqual([["wahoo"], ["strava"]]);
  });

  it("keeps onboarding dispatch free of a hard-coded provider list", () => {
    const source = readFileSync("components/onboarding/useProviderConnection.ts", "utf8");
    expect(source).toContain("connectProductionMobileProvider");
    expect(source).not.toMatch(/\bwahoo\b|\bstrava\b/);
  });

  it("rejects actions that the connector manifest does not expose", async () => {
    const context = {
      connectOAuth: jest.fn(async () => undefined),
      disconnectApi: jest.fn(async () => undefined),
      syncNow: jest.fn(async () => undefined),
      refreshSetupData: jest.fn(async () => undefined),
    };

    await expect(
      productionMobileProviderActionRegistry.dispatch("strava", "refresh_setup_data", context),
    ).rejects.toThrow(/unavailable/i);
    expect(context.refreshSetupData).not.toHaveBeenCalled();
  });
});
