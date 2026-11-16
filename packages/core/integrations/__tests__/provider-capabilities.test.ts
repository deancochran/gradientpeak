import { describe, expect, it } from "vitest";
import {
  certifyProviderManifestRegistry,
  createDirectProviderSourceProvenance,
  executableIntegrationProviderIdSchema,
  executableIntegrationProviderIdValues,
  getConfigurableProviderActions,
  getProviderActionAuthorization,
  getProviderCapabilityUnavailableReason,
  getProviderPlannedActivityCapability,
  getProviderRequiredOperationTokens,
  getProviderSyncMode,
  getProvidersWithCapability,
  getProviderWorkerRequirements,
  isProviderActivityHistoryReconciliationTarget,
  type ProviderManifest,
  persistentIntegrationSourceIdSchema,
  persistentIntegrationSourceIdValues,
  providerCapabilityRegistry,
  providerCapabilitySchema,
  providerCapabilityValues,
  providerConnectionDescriptorSchema,
  providerConnectionModelSchema,
  providerExecutionSchema,
  providerHasCapability,
  providerOnboardingPresentationSchema,
  providerSourceProvenanceSchema,
  stravaProviderManifest,
} from "../provider-capabilities";

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
  id: "health-device",
  connectorId: "health-device",
  defaultSourceId: "health-device",
  connection: { kind: "device_permissions" },
  execution: "mobile",
  capabilities: compileOnlyCapabilities,
  runtimeOperations: [],
  actions: [],
  workerRequirements: [],
} as const satisfies ProviderManifest<
  "health-device",
  "health-device",
  { kind: "device_permissions" },
  "mobile"
>;

function compileOnlySyntheticManifestIsNotExecutable() {
  // @ts-expect-error Compile-only connector IDs do not become persistent/executable registry IDs.
  const executable: (typeof providerCapabilityRegistry)[number] = syntheticDeviceManifest;
  return executable;
}

describe("provider capability registry", () => {
  it("keeps durable provider identities neutral while exposing configured contract implementations", () => {
    expect(providerCapabilityRegistry.map((provider) => provider.id)).toEqual(
      executableIntegrationProviderIdValues,
    );
    expect(persistentIntegrationSourceIdValues).toEqual([
      "wahoo",
      "strava",
      "trainingpeaks",
      "garmin",
      "zwift",
    ]);
    expect(persistentIntegrationSourceIdSchema.safeParse("strava").success).toBe(true);
    expect(executableIntegrationProviderIdSchema.safeParse("strava").success).toBe(true);
  });

  it("certifies every executable connector manifest is complete and internally consistent", () => {
    expect(providerCapabilityRegistry).toHaveLength(executableIntegrationProviderIdValues.length);
    expect(new Set(providerCapabilityRegistry.map((manifest) => manifest.connectorId)).size).toBe(
      executableIntegrationProviderIdValues.length,
    );

    for (const manifest of providerCapabilityRegistry) {
      expect(manifest.id).toBe(manifest.connectorId);
      expect(executableIntegrationProviderIdSchema.safeParse(manifest.connectorId).success).toBe(
        true,
      );
      expect(persistentIntegrationSourceIdSchema.safeParse(manifest.defaultSourceId).success).toBe(
        true,
      );
      expect(providerConnectionModelSchema.safeParse(manifest.connection).success).toBe(true);
      expect(providerExecutionSchema.safeParse(manifest.execution).success).toBe(true);

      for (const capability of providerCapabilitySchema.options) {
        const declaration = manifest.capabilities[capability];
        expect(declaration).toBeDefined();
        if (declaration.status === "supported") {
          expect(declaration.operations.length).toBeGreaterThan(0);
          expect(getProviderRequiredOperationTokens(manifest.connectorId)).toEqual(
            expect.arrayContaining([...declaration.operations]),
          );
        } else {
          expect(declaration.reason.trim().length).toBeGreaterThan(0);
          expect("operations" in declaration).toBe(false);
        }
      }

      for (const action of manifest.actions) {
        expect(getProviderActionAuthorization(manifest.connectorId, action.action)).toEqual(action);
      }
      for (const worker of getProviderWorkerRequirements(manifest.connectorId)) {
        expect(worker.worker.trim().length).toBeGreaterThan(0);
        expect(getProviderRequiredOperationTokens(manifest.connectorId)).toContain(
          worker.operation,
        );
      }
    }
  });

  it("represents synthetic connector and execution kinds without registering them", () => {
    expect(compileOnlySyntheticManifestIsNotExecutable).toBeTypeOf("function");
    expect(providerConnectionDescriptorSchema.parse(syntheticDeviceManifest.connection)).toEqual({
      kind: "device_permissions",
    });
    expect(
      new Set<string>(providerCapabilityRegistry.map(({ connectorId }) => connectorId)).has(
        "health-device",
      ),
    ).toBe(false);
    for (const kind of [
      "oauth2",
      "device_permissions",
      "api_key",
      "file_import",
      "none",
    ] as const) {
      expect(providerConnectionDescriptorSchema.safeParse({ kind }).success).toBe(true);
    }
  });

  it("rejects incomplete, duplicate, and unsupported-operation manifests", () => {
    const wahoo = providerCapabilityRegistry.find((provider) => provider.connectorId === "wahoo");
    const strava = providerCapabilityRegistry.find((provider) => provider.connectorId === "strava");
    if (!wahoo || !strava) throw new Error("Expected Wahoo and Strava manifests");
    // These fixtures deliberately violate the manifest contract to test runtime rejection.
    const replaceStrava = (replacement: unknown) =>
      providerCapabilityRegistry.map((provider) =>
        provider.connectorId === "strava" ? replacement : provider,
      );
    expect(() => certifyProviderManifestRegistry([wahoo, wahoo] as never)).toThrow(
      /duplicate|missing/i,
    );
    const invalidUnsupported = {
      ...strava,
      capabilities: {
        ...strava.capabilities,
        route_push: {
          status: "unsupported",
          reason: "No route delivery.",
          operations: ["disconnect"],
        },
      },
    };
    expect(() =>
      certifyProviderManifestRegistry(replaceStrava(invalidUnsupported) as never),
    ).toThrow(/unsupported.*operations/i);
    expect(() =>
      certifyProviderManifestRegistry(replaceStrava({ ...strava, id: "wahoo" }) as never),
    ).toThrow(/id.*connector/i);
    expect(() =>
      certifyProviderManifestRegistry(replaceStrava({ ...strava, connection: "oauth2" }) as never),
    ).toThrow(/connection descriptor/i);
    expect(() =>
      certifyProviderManifestRegistry(
        replaceStrava({
          ...strava,
          actions: [
            ...strava.actions,
            {
              action: "refresh_setup_data",
              capability: "profile_enrichment_read",
              userFacing: false,
            },
          ],
        }) as never,
      ),
    ).toThrow(/action capability is unsupported/i);
  });

  it("keeps aggregator provenance independent of connector source identity", () => {
    expect(
      providerSourceProvenanceSchema.parse({
        connector: { connectorId: "strava", externalId: "strava-activity-1" },
        source: {
          sourceId: "aggregated-feed:partner-42",
          externalId: "external-activity-1",
        },
      }),
    ).toMatchObject({
      connector: { connectorId: "strava", externalId: "strava-activity-1" },
      source: { sourceId: "aggregated-feed:partner-42", externalId: "external-activity-1" },
    });
    expect(
      createDirectProviderSourceProvenance({ connectorId: "wahoo", externalId: "123" }),
    ).toEqual({
      connector: { connectorId: "wahoo", externalId: "123" },
      source: { sourceId: "wahoo", externalId: "123" },
    });
  });

  it("marks Wahoo as the MVP file-first activity import provider", () => {
    expect(providerHasCapability("wahoo", "activity_history_read")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_download")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_format_fit")).toBe(true);
    expect(getProviderSyncMode("wahoo", "activity_history_read")).toBe("automatic");
    expect(isProviderActivityHistoryReconciliationTarget("wahoo")).toBe(true);
  });

  it("does not encode runtime enablement separately from server configuration", () => {
    expect(providerCapabilityRegistry.every((provider) => !("runtimeStatus" in provider))).toBe(
      true,
    );
  });

  it("publishes stable user-safe onboarding presentation metadata", () => {
    const wahoo = providerCapabilityRegistry.find((provider) => provider.id === "wahoo");
    expect(providerOnboardingPresentationSchema.parse(wahoo?.onboarding)).toEqual({
      summary: "Import profile details and activity history from your Wahoo account.",
      evidence: { activityHistory: true, profileDetails: true },
    });
    expect(JSON.stringify(wahoo?.onboarding)).not.toMatch(/icon|className|tailwind/i);
  });

  it("filters connected providers by capability", () => {
    expect(getProvidersWithCapability(["wahoo"], "planned_activity_push")).toEqual(["wahoo"]);
  });

  it("declares Wahoo implementation support separately from route delivery", () => {
    expect(providerHasCapability("wahoo", "planned_activity_push")).toBe(true);
    expect(providerHasCapability("wahoo", "route_push")).toBe(false);
    expect(getProviderSyncMode("wahoo", "planned_activity_push")).toBe("automatic");
    expect(getProviderCapabilityUnavailableReason("wahoo", "planned_activity_push")).toBeNull();
    expect(getProviderPlannedActivityCapability("wahoo")).toMatchObject({
      maturity: "available",
      supportedActivityCategories: ["run", "bike"],
      supportedDurations: ["time", "distance"],
      supportedTargets: expect.arrayContaining([
        "%FTP",
        "%MaxHR",
        "%ThresholdHR",
        "watts",
        "bpm",
        "speed",
        "cadence",
      ]),
      supportsBoundaries: false,
    });
  });

  it("derives user-configurable actions instead of exposing raw capabilities", () => {
    expect(getProviderSyncMode("wahoo", "profile_enrichment_read")).toBe("manual");
    expect(getConfigurableProviderActions("wahoo")).toEqual(["disconnect", "sync_now"]);
  });

  it("declares Strava history reads and manual completed-activity export without download claims", () => {
    expect(providerHasCapability("strava", "activity_history_read")).toBe(true);
    expect(providerHasCapability("strava", "activity_file_download")).toBe(false);
    expect(providerHasCapability("strava", "planned_activity_push")).toBe(false);
    expect(providerHasCapability("strava", "completed_activity_export")).toBe(true);
    expect(providerHasCapability("strava", "webhook_activity_updates")).toBe(true);
    expect(getProviderSyncMode("strava", "activity_history_read")).toBe("manual");
    expect(getProviderSyncMode("strava", "completed_activity_export")).toBe("manual");
    expect(getProviderSyncMode("strava", "webhook_activity_updates")).toBe("automatic");
    expect(getProviderPlannedActivityCapability("strava").maturity).toBe("unavailable");
    expect(getConfigurableProviderActions("strava")).toEqual(["disconnect", "sync_now"]);
    expect(isProviderActivityHistoryReconciliationTarget("strava")).toBe(true);
  });

  it("declares Garmin's worker-backed scheduled activity-plan subset without data-ingestion claims", () => {
    const garmin = providerCapabilityRegistry.find((provider) => provider.connectorId === "garmin");
    expect(garmin?.connection).toEqual({ kind: "oauth2" });
    expect(garmin?.workerRequirements).toEqual([
      { operation: "planned_activity_push", worker: "garmin-training-sync" },
    ]);
    expect(garmin?.runtimeOperations).toEqual([
      "oauth_authorization",
      "oauth_callback",
      "disconnect",
    ]);
    expect(providerHasCapability("garmin", "planned_activity_push")).toBe(true);
    expect(
      providerCapabilityValues
        .filter((capability) => capability !== "planned_activity_push")
        .every((capability) => !providerHasCapability("garmin", capability)),
    ).toBe(true);
  });
});
