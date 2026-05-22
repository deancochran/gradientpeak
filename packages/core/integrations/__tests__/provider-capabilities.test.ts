import { describe, expect, it } from "vitest";
import {
  getConfigurableProviderActions,
  getProviderSyncMode,
  getProvidersWithCapability,
  providerHasCapability,
} from "../provider-capabilities";

describe("provider capability registry", () => {
  it("marks Wahoo as the MVP file-first activity import provider", () => {
    expect(providerHasCapability("wahoo", "activity_history_read")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_download")).toBe(true);
    expect(providerHasCapability("wahoo", "activity_file_format_fit")).toBe(true);
    expect(getProviderSyncMode("wahoo", "activity_history_read")).toBe("automatic");
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
    ).toEqual(["wahoo", "trainingpeaks"]);
  });

  it("derives user-configurable actions instead of exposing raw capabilities", () => {
    expect(getProviderSyncMode("wahoo", "profile_enrichment_read")).toBe("manual");
    expect(getProviderSyncMode("trainingpeaks", "planned_activity_push")).toBe("automatic");
    expect(getConfigurableProviderActions("wahoo")).toEqual(["disconnect", "sync_now"]);
    expect(getConfigurableProviderActions("trainingpeaks")).toEqual(["disconnect"]);
    expect(getConfigurableProviderActions("garmin")).toEqual(["disconnect"]);
  });
});
