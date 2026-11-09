import { describe, expect, it } from "vitest";
import {
  calculateHRZoneDistribution,
  calculateHRZonesFromReserve,
  getHrZoneUpperBoundsFromLthr,
} from "../hr";
import { getTrainingIntensityZone } from "../intensity";
import { calculatePowerZoneDistribution, getPowerZoneUpperBoundsFromFtp } from "../power";

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
          timestamps: [0, 5, 10],
          sampleCount: 3,
        },
        170,
      ),
    ).toMatchObject({ status: "available", zoneSeconds: [0, 5, 0, 0, 5] });

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

  it("projects canonical live upper bounds only from caller-supplied thresholds", () => {
    expect(getHrZoneUpperBoundsFromLthr(170)).toEqual([137.7, 153, 159.8, 170, Infinity]);
    expect(getPowerZoneUpperBoundsFromFtp(250)).toEqual([
      137.5,
      190,
      227.5,
      265,
      302.5,
      377.5,
      Infinity,
    ]);
    expect(getHrZoneUpperBoundsFromLthr(0)).toEqual([]);
    expect(getPowerZoneUpperBoundsFromFtp(Number.NaN)).toEqual([]);
  });
});
