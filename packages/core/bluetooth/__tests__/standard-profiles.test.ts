import { describe, expect, it } from "vitest";
import { BLE_CHARACTERISTIC_UUIDS, BLE_SERVICE_UUIDS } from "../../constants/ble";
import { listStandardBleProfileDefinitions, matchStandardBleProfiles } from "../standard-profiles";

describe("standard BLE profile registry", () => {
  it("declares stable service and measurement pairs", () => {
    expect(listStandardBleProfileDefinitions().map(({ id }) => id)).toEqual([
      "heart_rate",
      "cycling_power",
      "cycling_speed_and_cadence",
      "running_speed_and_cadence",
    ]);
  });

  it("matches a profile only when service and characteristic ownership agree", () => {
    const matching = matchStandardBleProfiles({
      services: [BLE_SERVICE_UUIDS.CYCLING_POWER.toUpperCase()],
      characteristics: new Map([
        [
          BLE_CHARACTERISTIC_UUIDS.CYCLING_POWER_MEASUREMENT,
          BLE_SERVICE_UUIDS.CYCLING_POWER.toUpperCase(),
        ],
      ]),
    });
    const wrongService = matchStandardBleProfiles({
      services: [BLE_SERVICE_UUIDS.CYCLING_POWER],
      characteristics: new Map([
        [BLE_CHARACTERISTIC_UUIDS.CYCLING_POWER_MEASUREMENT, BLE_SERVICE_UUIDS.HEART_RATE],
      ]),
    });

    expect(matching.map(({ id }) => id)).toEqual(["cycling_power"]);
    expect(wrongService).toEqual([]);
  });
});
