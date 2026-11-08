import { describe, expect, it } from "vitest";
import {
  getConfigurableProviderActions,
  getProviderPlannedActivityCapability,
  getProvidersWithCapability,
  providerCapabilityIsAuthorized,
  providerHasCapability,
} from "../provider-capabilities";

describe("Garmin Training capability contract", () => {
  it("requires WORKOUT_IMPORT for the supported scheduled activity-plan subset", () => {
    expect(providerHasCapability("garmin", "planned_activity_push")).toBe(true);
    expect(
      providerCapabilityIsAuthorized({
        provider: "garmin",
        capability: "planned_activity_push",
        grantedScope: "WORKOUT_IMPORT",
      }),
    ).toBe(true);
    expect(getProviderPlannedActivityCapability("garmin")).toMatchObject({
      maturity: "available",
      supportedActivityCategories: ["run", "bike"],
      supportedDurations: ["time", "distance"],
      supportedTargets: ["watts", "bpm", "speed", "cadence"],
    });
    expect(
      providerCapabilityIsAuthorized({
        provider: "garmin",
        capability: "planned_activity_push",
        grantedScope: "",
      }),
    ).toBe(false);
  });

  it("selects Garmin and Wahoo, but not Strava, for planned-activity delivery", () => {
    expect(getProvidersWithCapability(["garmin"], "planned_activity_push")).toEqual(["garmin"]);
    expect(
      getProvidersWithCapability(["garmin", "strava", "wahoo"], "planned_activity_push"),
    ).toEqual(["garmin", "wahoo"]);
    expect(getConfigurableProviderActions("garmin")).toEqual(["disconnect"]);
  });
});
