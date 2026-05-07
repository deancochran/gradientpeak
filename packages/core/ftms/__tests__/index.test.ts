import { describe, expect, it } from "vitest";
import { FTMS_CHARACTERISTICS } from "../../constants/ble";
import { detectFtmsMachineType, FTMS_MEASUREMENT_AND_STATUS_CHARACTERISTIC_UUIDS } from "..";

describe("ftms foundations", () => {
  it("lists FTMS data and status characteristics mobile should subscribe to", () => {
    expect(FTMS_MEASUREMENT_AND_STATUS_CHARACTERISTIC_UUIDS).toEqual(
      expect.arrayContaining([
        FTMS_CHARACTERISTICS.TREADMILL_DATA,
        FTMS_CHARACTERISTICS.CROSS_TRAINER_DATA,
        FTMS_CHARACTERISTICS.STEP_CLIMBER_DATA,
        FTMS_CHARACTERISTICS.STAIR_CLIMBER_DATA,
        FTMS_CHARACTERISTICS.ROWER_DATA,
        FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA,
        FTMS_CHARACTERISTICS.TRAINING_STATUS,
        FTMS_CHARACTERISTICS.STATUS,
      ]),
    );
  });

  it("prefers data characteristic machine type over feature heuristics", () => {
    const result = detectFtmsMachineType({
      characteristicUuids: [FTMS_CHARACTERISTICS.ROWER_DATA.toUpperCase()],
      features: {
        powerMeasurementSupported: true,
        indoorBikeSimulationSupported: true,
      },
    });

    expect(result.machineType).toBe("rower");
    expect(result.source).toBe("data_characteristic");
    expect(result.matchedCharacteristicUuid).toBe(FTMS_CHARACTERISTICS.ROWER_DATA);
  });

  it("falls back to feature heuristics when data characteristics are absent", () => {
    const result = detectFtmsMachineType({
      features: {
        inclinationSupported: true,
        paceSupported: true,
      },
    });

    expect(result.machineType).toBe("treadmill");
    expect(result.source).toBe("feature_heuristic");
  });
});
