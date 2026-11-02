import { describe, expect, it } from "vitest";
import { FTMS_CHARACTERISTICS } from "../../constants/ble";
import {
  getFtmsParserDefinition,
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseCyclingPowerMeasurementWithState,
  parseFtmsTreadmillData,
  parseHeartRateMeasurement,
  parseRunningSpeedAndCadenceMeasurement,
  unsignedDeltaWithWrap,
} from "..";

function toArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

describe("standard Bluetooth parsers", () => {
  it("parses 8-bit and 16-bit heart rate", () => {
    expect(parseHeartRateMeasurement(toArrayBuffer([0x00, 72])).hrBpm).toBe(72);
    expect(parseHeartRateMeasurement(toArrayBuffer([0x01, 0x01, 0x01])).hrBpm).toBe(257);
  });

  it("parses instantaneous cycling power", () => {
    const result = parseCyclingPowerMeasurement(toArrayBuffer([0x00, 0x00, 0xfa, 0x00]));
    expect(result.powerWatts).toBe(250);
    expect(result.cadenceRpm).toBeNull();
  });

  it("derives cycling-power cadence from crank deltas", () => {
    const first = parseCyclingPowerMeasurementWithState(
      toArrayBuffer([0x20, 0x00, 0xfa, 0x00, 0xe8, 0x03, 0x00, 0x08]),
    );
    const second = parseCyclingPowerMeasurementWithState(
      toArrayBuffer([0x20, 0x00, 0x04, 0x01, 0xed, 0x03, 0x00, 0x18]),
      first.nextState,
    );
    expect(second.powerWatts).toBe(260);
    expect(second.cadenceRpm).toBe(75);
    expect(second.truncated).toBe(false);
  });

  it("reports truncated cycling-power optional fields", () => {
    expect(
      parseCyclingPowerMeasurementWithState(toArrayBuffer([0x20, 0x00, 0xfa, 0x00, 0xe8]))
        .truncated,
    ).toBe(true);
    expect(
      parseCyclingPowerMeasurementWithState(toArrayBuffer([0x01, 0x00, 0xfa, 0x00])).truncated,
    ).toBe(true);
  });

  it("parses running speed and cadence", () => {
    const result = parseRunningSpeedAndCadenceMeasurement(toArrayBuffer([0x00, 0x00, 0x05, 0x58]));
    expect(result.speedMps).toBe(5);
    expect(result.cadenceRpm).toBe(88);
  });

  it("derives CSC cadence from crank deltas", () => {
    const first = parseCscMeasurement(toArrayBuffer([0x02, 0xe8, 0x03, 0x00, 0x08]));
    const second = parseCscMeasurement(
      toArrayBuffer([0x02, 0xed, 0x03, 0x00, 0x18]),
      first.nextState,
    );
    expect(second.cadenceRpm).toBe(75);
  });

  it("handles wrapped CSC counters", () => {
    const result = parseCscMeasurement(toArrayBuffer([0x02, 0x00, 0x00, 0xdc, 0x01]), {
      lastCrankRevolutions: 65535,
      lastCrankEventTime1024: 65500,
    });
    expect(result.cadenceRpm).toBe(120);
  });

  it("derives CSC wheel speed with a known circumference", () => {
    const result = parseCscMeasurement(toArrayBuffer([0x01, 0xed, 0x03, 0x00, 0x00, 0x00, 0x0c]), {
      lastWheelRevolutions: 1000,
      lastWheelEventTime1024: 2048,
      wheelCircumferenceMeters: 2.1,
    });
    expect(result.speedMps).toBe(10.5);
  });

  it("calculates wrapped unsigned deltas", () => {
    expect(unsignedDeltaWithWrap(2, 65534, 16)).toBe(4);
    expect(unsignedDeltaWithWrap(10, 2, 16)).toBe(8);
  });
});

describe("FTMS compatibility exports", () => {
  it("delegates corrected FTMS parsing to @deancochran/ftms", () => {
    const result = parseFtmsTreadmillData(
      toArrayBuffer([0x60, 0x10, 0xe8, 0x03, 0x2c, 0x01, 0x40, 0x01, 0xec, 0xff, 0xfa, 0x00]),
    );
    expect(result.metrics.instantaneousPaceSecondsPer500m).toBe(300);
    expect(result.metrics.averagePaceSecondsPer500m).toBe(320);
    expect(result.metrics.forceOnBeltNewtons).toBe(-20);
    expect(result.metrics.powerWatts).toBe(250);
  });

  it("keeps the established parser-registry export", () => {
    expect(getFtmsParserDefinition(FTMS_CHARACTERISTICS.STATUS)?.kind).toBe("machine_status");
  });
});
