import { providerManifestRegistry } from "@repo/core";
import { describe, expect, it } from "vitest";
import { readProviderReadiness } from "./provider-readiness";

describe("readProviderReadiness", () => {
  it("redacts credential values and provider endpoints from diagnostic output", () => {
    const clientId = "never-print-client-id";
    const clientSecret = "never-print-client-secret";
    const report = readProviderReadiness({
      GARMIN_CLIENT_ID: clientId,
      GARMIN_CLIENT_SECRET: clientSecret,
      OAUTH_CALLBACK_BASE_URL: "https://dev.example.test",
    });
    const output = JSON.stringify(report);

    expect(output).not.toContain(clientId);
    expect(output).not.toContain(clientSecret);
    expect(output).not.toContain("connect.garmin.com");
    expect(report.find((entry) => entry.provider === "garmin")).toMatchObject({
      credentials: { presence: "present" },
      locallyConfigured: true,
    });
  });

  it.each([
    [{}, "missing"],
    [{ GARMIN_CLIENT_ID: "configured" }, "partial"],
    [{ GARMIN_CLIENT_ID: " ", GARMIN_CLIENT_SECRET: "configured" }, "partial"],
  ] as const)("reports Garmin %s credential configuration as %s", (env, presence) => {
    const garmin = readProviderReadiness(env).find((entry) => entry.provider === "garmin");

    expect(garmin).toMatchObject({ credentials: { presence }, locallyConfigured: false });
  });

  it("reports an invalid callback base without echoing it", () => {
    const invalidCallback = "https://callback.example.test/?unsafe=query";
    const garmin = readProviderReadiness({
      GARMIN_CLIENT_ID: "configured",
      GARMIN_CLIENT_SECRET: "configured",
      OAUTH_CALLBACK_BASE_URL: invalidCallback,
    }).find((entry) => entry.provider === "garmin");

    expect(garmin).toMatchObject({
      callback: { baseStatus: "invalid", expectedPath: "/api/integrations/callback/garmin" },
      locallyConfigured: false,
    });
    expect(JSON.stringify(garmin)).not.toContain(invalidCallback);
  });

  it("enumerates registered providers and their manifest-declared operations", () => {
    const report = readProviderReadiness({});

    expect(report.map((entry) => entry.provider)).toEqual(
      providerManifestRegistry.map((manifest) => manifest.connectorId),
    );
    for (const manifest of providerManifestRegistry) {
      expect(report).toContainEqual(
        expect.objectContaining({
          provider: manifest.connectorId,
          manifestRegistered: true,
          directRuntimeOperations: manifest.runtimeOperations,
          workerRequirements: manifest.workerRequirements,
        }),
      );
    }
  });

  it("distinguishes worker-backed capabilities from direct runtime operations", () => {
    const report = readProviderReadiness({});
    expect(
      report.find((entry) => entry.provider === "wahoo")?.declaredSupportedCapabilities,
    ).toEqual(expect.arrayContaining(["planned_activity_push", "webhook_activity_updates"]));
    expect(
      report.find((entry) => entry.provider === "strava")?.declaredSupportedCapabilities,
    ).toContain("webhook_activity_updates");
    expect(report.find((entry) => entry.provider === "garmin")).toMatchObject({
      declaredSupportedCapabilities: ["planned_activity_push"],
      workerRequirements: [{ operation: "planned_activity_push", worker: "garmin-training-sync" }],
    });
  });
});
