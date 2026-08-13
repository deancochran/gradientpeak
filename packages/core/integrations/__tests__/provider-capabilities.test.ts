import { describe, expect, it } from "vitest";
import {
  executableIntegrationProviderIdSchema,
  executableIntegrationProviderIdValues,
  getConfigurableProviderActions,
  getProviderCapabilityUnavailableReason,
  getProviderPlannedActivityCapability,
  getProviderSyncMode,
  getProvidersWithCapability,
  isProviderActivityHistoryReconciliationTarget,
  persistentIntegrationSourceIdSchema,
  persistentIntegrationSourceIdValues,
  providerCapabilityRegistry,
  providerHasCapability,
  providerOnboardingPresentationSchema,
} from "../provider-capabilities";

describe("provider capability registry", () => {
  it("keeps durable provider identities neutral while exposing only Wahoo executable capabilities", () => {
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
    expect(executableIntegrationProviderIdSchema.safeParse("strava").success).toBe(false);
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
});
