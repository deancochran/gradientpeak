import { describe, expect, it } from "vitest";
import {
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseFtmsIndoorBikeData,
  parseHeartRateMeasurement,
  unsignedDeltaWithWrap,
} from "..";

function toArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

describe("bluetooth parsers", () => {
  describe("parseHeartRateMeasurement", () => {
    it("parses 8-bit heart rate", () => {
      const result = parseHeartRateMeasurement(toArrayBuffer([0x00, 72]));
      expect(result.hrBpm).toBe(72);
    });

    it("parses 16-bit heart rate", () => {
      const result = parseHeartRateMeasurement(toArrayBuffer([0x01, 0x01, 0x01]));
      expect(result.hrBpm).toBe(257);
    });
  });

  describe("parseCyclingPowerMeasurement", () => {
    it("parses instantaneous power from mandatory field", () => {
      const result = parseCyclingPowerMeasurement(toArrayBuffer([0x00, 0x00, 0xfa, 0x00]));

      expect(result.powerWatts).toBe(250);
      expect(result.cadenceRpm).toBeNull();
    });
  });

  describe("parseCscMeasurement", () => {
    it("derives cadence from crank deltas and does not emit cumulative as cadence", () => {
      const first = parseCscMeasurement(toArrayBuffer([0x02, 0xe8, 0x03, 0x00, 0x08]));
      expect(first.cadenceRpm).toBeNull();

      const second = parseCscMeasurement(
        toArrayBuffer([0x02, 0xed, 0x03, 0x00, 0x18]),
        first.nextState,
      );

      expect(second.cadenceRpm).toBe(75);
    });

    it("handles 16-bit crank wrap for revolutions and event time", () => {
      const prev = {
        lastCrankRevolutions: 65535,
        lastCrankEventTime1024: 65500,
      };
      const result = parseCscMeasurement(toArrayBuffer([0x02, 0x00, 0x00, 0xdc, 0x01]), prev);

      expect(result.cadenceRpm).toBe(120);
    });

    it("derives wheel speed when wheel data and circumference are available", () => {
      const prev = {
        lastWheelRevolutions: 1000,
        lastWheelEventTime1024: 2048,
        wheelCircumferenceMeters: 2.1,
      };

      const result = parseCscMeasurement(
        toArrayBuffer([0x01, 0xed, 0x03, 0x00, 0x00, 0x00, 0x0c]),
        prev,
      );

      expect(result.speedMps).toBe(10.5);
    });
  });

  describe("parseFtmsIndoorBikeData", () => {
    it("parses speed, cadence, power, and hr with flag-driven offsets", () => {
      const flags = 0x04 | 0x40 | 0x200;
      const result = parseFtmsIndoorBikeData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x10,
          0x27,
          0xb4,
          0x00,
          0xc8,
          0x00,
          0x96,
        ]),
      );

      expect(result.speedMps).toBeCloseTo(27.78, 2);
      expect(result.cadenceRpm).toBe(90);
      expect(result.powerWatts).toBe(200);
      expect(result.hrBpm).toBe(150);
      expect(result.truncated).toBe(false);
    });

    it("does not throw and marks truncated data", () => {
      const flags = 0x40 | 0x200;
      const result = parseFtmsIndoorBikeData(
        toArrayBuffer([flags & 0xff, (flags >> 8) & 0xff, 0x01]),
      );

      expect(result.powerWatts).toBeNull();
      expect(result.hrBpm).toBeNull();
      expect(result.truncated).toBe(true);
    });
  });

  describe("unsignedDeltaWithWrap", () => {
    it("calculates wrapped unsigned deltas", () => {
      expect(unsignedDeltaWithWrap(2, 65534, 16)).toBe(4);
      expect(unsignedDeltaWithWrap(10, 2, 16)).toBe(8);
    });
  });
});
