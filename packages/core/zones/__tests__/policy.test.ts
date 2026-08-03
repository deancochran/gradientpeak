import { describe, expect, it } from "vitest";
import { resolveProfileZones } from "../policy";

describe("resolveProfileZones", () => {
  it("uses the canonical unrounded FTP and bike-LTHR policy boundaries", () => {
    const facts = {
      cycling: { planningThresholdPower: { status: "available" as const, value: 250 } },
      heartRate: { bike: { lthr: { status: "available" as const, valueBpm: 170 } } },
    };

    expect(resolveProfileZones(facts)).toMatchObject({
      powerZones: {
        policyVersion: "cycling_ftp_zones_v1",
        zone1: { min: 0, max: 138 },
        zone7: { min: 378, max: null },
      },
      heartRateZones: {
        policyVersion: "sport_lthr_zones_v1",
        zone1: { min: 0, max: 138 },
        zone5: { min: 170, max: null },
      },
    });
  });

  it("returns unavailable zones for stale or non-bike calibration", () => {
    const facts = {
      cycling: { planningThresholdPower: { status: "unavailable" as const, value: null } },
      heartRate: { bike: { lthr: { status: "unavailable" as const, valueBpm: null } } },
    };

    expect(resolveProfileZones(facts)).toEqual({ powerZones: null, heartRateZones: null });
  });
});
