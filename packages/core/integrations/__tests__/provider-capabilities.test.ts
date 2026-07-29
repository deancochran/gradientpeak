import { describe, expect, it } from "vitest";
import {
  getConfigurableProviderActions,
  getProviderCapabilityUnavailableReason,
  getProviderPlannedActivityCapability,
  getProviderSyncMode,
  getProvidersWithCapability,
  integrationProviderIdValues,
  isProviderRuntimeEnabled,
  providerCapabilityRegistry,
  providerHasCapability,
} from "../provider-capabilities";

describe("provider capability registry", () => {
  it("has one capability definition for every provider ID", () => {
    expect(providerCapabilityRegistry.map((provider) => provider.id)).toEqual(
      integrationProviderIdValues,
    );
  });

  it("marks Wahoo as the MVP file-first activity import provider", () => {
    expect(isProviderRuntimeEnabled("wahoo")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_history_read")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_download")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_format_fit")).toBe(true);
    expect(getProviderSyncMode("wahoo", "activity_history_read")).toBe("automatic");
  });

  it("keeps future provider contracts without exposing scaffold runtimes", () => {
    expect(
      providerCapabilityRegistry
        .filter((provider) => isProviderRuntimeEnabled(provider.id))
        .map((provider) => provider.id),
    ).toEqual(["wahoo"]);
    expect(
      providerCapabilityRegistry.find((provider) => provider.id === "strava")?.runtimeStatus,
    ).toBe("scaffold");
    expect(providerHasCapability("trainingpeaks", "planned_activity_push")).toBe(false);
    expect(getProviderSyncMode("trainingpeaks", "planned_activity_push")).toBe("unsupported");
  });

  it("does not enable full automatic Strava activity import without provider files", () => {
    expect(providerHasCapability("strava", "activity_history_read")).toBe(true);
    expect(providerHasCapability("strava", "activity_file_download")).toBe(false);
    expect(providerHasCapability("strava", "activity_file_format_fit")).toBe(false);
    expect(getConfigurableProviderActions("strava")).toEqual(["disconnect"]);
  });

  it("filters connected providers by capability", () => {
    expect(
      getProvidersWithCapability(["wahoo", "strava", "trainingpeaks"], "planned_activity_push"),
    ).toEqual(["wahoo"]);
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
    expect(getProviderPlannedActivityCapability("garmin")).toMatchObject({
      maturity: "evidence_gated",
      supportedActivityCategories: [],
      supportedTargets: [],
    });
  });

  it("derives user-configurable actions instead of exposing raw capabilities", () => {
    expect(getProviderSyncMode("wahoo", "profile_enrichment_read")).toBe("manual");
    expect(getConfigurableProviderActions("wahoo")).toEqual(["disconnect", "sync_now"]);
    expect(getConfigurableProviderActions("trainingpeaks")).toEqual(["disconnect"]);
    expect(getConfigurableProviderActions("garmin")).toEqual(["disconnect"]);
  });
});
