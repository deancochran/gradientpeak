import {
  type ExecutableIntegrationProviderId,
  type ProviderManifest,
  providerManifestRegistry,
  stravaProviderManifest,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { DrizzleTransactionClient } from "../../db";
import type { OnboardingProviderWorkSnapshot } from "../../repositories/onboarding-lifecycle-repository";
import { dispatchInitialOnboardingWork } from "../onboarding/provider-dispatch";
import {
  type ComposedProviderRuntime,
  certifyComposedProviderRuntimeRegistry,
  createComposedProviderRuntimeRegistry,
  type OAuthServerProviderRuntime,
  type ProviderTransactionalRuntimeContext,
} from "./provider-runtime";
import {
  executableProviderRuntimes,
  getProviderCompletedActivityExportRuntime,
  getProviderOnboardingRuntime,
  getProviderReviewedSourceMaterializationRuntime,
  providerRuntimeRegistry,
} from "./provider-runtime-registry";
import { stravaProviderRuntime } from "./strava-provider-runtime";

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

const compileOnlyManifestParts = {
  capabilities: compileOnlyCapabilities,
  runtimeOperations: [],
  actions: [],
  workerRequirements: [],
} as const;

const deviceManifest = {
  ...stravaProviderManifest,
  ...compileOnlyManifestParts,
  id: "device-only",
  connectorId: "device-only",
  defaultSourceId: "device-only",
  connection: { kind: "device_permissions" },
  execution: "mobile",
} as const satisfies ProviderManifest<
  "device-only",
  "device-only",
  { kind: "device_permissions" },
  "mobile"
>;

const apiKeyManifest = {
  ...stravaProviderManifest,
  ...compileOnlyManifestParts,
  id: "api-key-server",
  connectorId: "api-key-server",
  defaultSourceId: "api-key-server",
  connection: { kind: "api_key" },
  execution: "server",
} as const satisfies ProviderManifest<
  "api-key-server",
  "api-key-server",
  { kind: "api_key" },
  "server"
>;

const requestPermissions = vi.fn(async () => true);
const storeApiKey = vi.fn(async () => undefined);

const deviceRuntime = {
  provider: "device-only",
  manifest: deviceManifest,
  connection: {
    kind: "device_permissions",
    provider: "device-only",
    operations: { requestPermissions },
  },
  execution: { kind: "mobile", mobile: { requestPermissions } },
} as const satisfies ComposedProviderRuntime<
  typeof deviceManifest,
  { requestPermissions: typeof requestPermissions },
  never,
  { requestPermissions: typeof requestPermissions }
>;

const apiKeyRuntime = {
  provider: "api-key-server",
  manifest: apiKeyManifest,
  connection: { kind: "api_key", provider: "api-key-server", operations: { storeApiKey } },
  execution: { kind: "server", server: { reconcile: vi.fn(async () => undefined) } },
} as const satisfies ComposedProviderRuntime<
  typeof apiKeyManifest,
  { storeApiKey: typeof storeApiKey },
  { reconcile: () => Promise<void> }
>;

function compileTimeCompletedExportRequirement() {
  const { completedActivityExport: _completedActivityExport, ...incompleteServer } =
    stravaProviderRuntime.execution.server;
  const incompleteRuntime: OAuthServerProviderRuntime<typeof stravaProviderManifest> = {
    ...stravaProviderRuntime,
    // @ts-expect-error Strava's manifest requires the completed-activity export component.
    execution: { kind: "server", server: incompleteServer },
  };
  return incompleteRuntime;
}

describe("composed provider runtime registry", () => {
  it("registers every executable manifest directly as a composed runtime", () => {
    expect(compileTimeCompletedExportRequirement).toBeTypeOf("function");
    expect(executableProviderRuntimes.map((runtime) => runtime.provider)).toEqual(
      providerManifestRegistry.map((manifest) => manifest.connectorId),
    );
    expect(providerRuntimeRegistry.get("strava")).toBe(stravaProviderRuntime);
    expect(providerRuntimeRegistry.get("wahoo")?.connection.kind).toBe("oauth2");
  });

  it("exposes only the requested server capability", () => {
    expect(getProviderCompletedActivityExportRuntime("strava")?.completedActivityExport).toBe(
      stravaProviderRuntime.execution.server.completedActivityExport,
    );
    expect(getProviderCompletedActivityExportRuntime("wahoo")).toBeNull();
    expect(getProviderReviewedSourceMaterializationRuntime("strava")).toBe(
      stravaProviderRuntime.execution.server.reviewedSourceMaterialization,
    );
    expect(getProviderReviewedSourceMaterializationRuntime("wahoo")).toBeNull();
    expect(getProviderOnboardingRuntime("strava")).toBe(
      stravaProviderRuntime.execution.server.onboarding,
    );
  });

  it("composes non-OAuth runtimes without fake OAuth or server methods", () => {
    expect(deviceRuntime.connection.operations.requestPermissions).toBe(requestPermissions);
    expect("exchangeOAuthCode" in deviceRuntime.connection).toBe(false);
    expect("server" in deviceRuntime.execution).toBe(false);
    expect(apiKeyRuntime.connection.operations.storeApiKey).toBe(storeApiKey);
    expect("exchangeOAuthCode" in apiKeyRuntime.connection).toBe(false);
    expect(() =>
      certifyComposedProviderRuntimeRegistry(
        [deviceManifest, apiKeyManifest],
        [deviceRuntime, apiKeyRuntime],
      ),
    ).not.toThrow();
    const registry = createComposedProviderRuntimeRegistry([deviceRuntime, apiKeyRuntime]);
    expect(registry.getOAuth("device-only")).toBeNull();
    expect(registry.getOAuth("api-key-server")).toBeNull();
  });

  it("rejects a manifest-declared server capability when its component is absent", () => {
    const { completedActivityExport: _completedActivityExport, ...incompleteServer } =
      stravaProviderRuntime.execution.server;
    const incomplete = {
      ...stravaProviderRuntime,
      execution: {
        kind: "server" as const,
        server: incompleteServer,
      },
    };
    expect(() =>
      certifyComposedProviderRuntimeRegistry([stravaProviderManifest], [incomplete]),
    ).toThrow(/completed_activity_export.*completedActivityExport/);
  });

  it("dispatches initial onboarding work through each selected runtime", async () => {
    const alpha = vi.fn(async () => ({ historyJobId: "alpha-history", profileJobId: null }));
    const beta = vi.fn(async () => ({ historyJobId: "beta-history", profileJobId: null }));
    const runtimes = new Map<
      ExecutableIntegrationProviderId,
      {
        enqueueInitialOnboardingWork: (
          input: ProviderTransactionalRuntimeContext,
        ) => Promise<{ historyJobId: string; profileJobId: string | null }>;
      }
    >([
      ["wahoo", { enqueueInitialOnboardingWork: alpha }],
      ["strava", { enqueueInitialOnboardingWork: beta }],
    ]);
    const providers = (["wahoo", "strava"] as const).map((provider) => ({
      active: true,
      generation: 1,
      id: `${provider}-integration`,
      provider,
      scope: null,
      importRun: null,
      jobs: [],
    })) satisfies OnboardingProviderWorkSnapshot[];
    await dispatchInitialOnboardingWork({
      runtimes,
      db: {} as DrizzleDbClient,
      profileId: "profile-1",
      providers,
      transaction: {} as DrizzleTransactionClient,
    });

    expect(alpha).toHaveBeenCalledOnce();
    expect(beta).toHaveBeenCalledOnce();
  });
});
