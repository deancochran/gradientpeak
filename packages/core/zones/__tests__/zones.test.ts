import { describe, expect, it } from "vitest";
import { calculateHRZoneDistribution, calculateHRZonesFromReserve } from "../hr";
import { getTrainingIntensityZone } from "../intensity";
import { calculatePowerZoneDistribution } from "../power";

describe("canonical zones", () => {
  it("calculates reserve-based HR zone boundaries", () => {
    const zones = calculateHRZonesFromReserve(190, 55);

    expect(zones.zone1.min).toBe(123);
    expect(zones.zone5.max).toBe(190);
    expect(zones.zone3.min).toBeLessThanOrEqual(zones.zone3.max);
  });

  it("distributes stream data into HR and power zones", () => {
    expect(
      calculateHRZoneDistribution(
        {
          metric: "hr",
          dataType: "float",
          values: [120, 150, 170],
          timestamps: [0, 60, 120],
          sampleCount: 3,
        },
        170,
      ),
    ).toEqual({ zone1: 60, zone2: 60, zone3: 0, zone4: 0, zone5: 60 });

    expect(
      calculatePowerZoneDistribution(
        {
          metric: "power",
          dataType: "float",
          values: [100, 180, 320],
          timestamps: [0, 60, 120],
          sampleCount: 3,
        },
        200,
      ),
    ).toEqual({
      zone1: 60,
      zone2: 0,
      zone3: 60,
      zone4: 0,
      zone5: 0,
      zone6: 0,
      zone7: 60,
    });
  });

  it("classifies training intensity zones consistently", () => {
    expect(getTrainingIntensityZone(0.5)).toBe("recovery");
    expect(getTrainingIntensityZone(0.9)).toBe("threshold");
    expect(getTrainingIntensityZone(1.2)).toBe("neuromuscular");
  });
});
