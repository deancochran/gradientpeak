import { describe, expect, it } from "vitest";
import { FTMS_CHARACTERISTICS } from "../../constants/ble";
import {
  FTMS_PARSER_DEFINITIONS_BY_UUID,
  getFtmsParserDefinition,
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseFtmsCrossTrainerData,
  parseFtmsIndoorBikeData,
  parseFtmsRowerData,
  parseFtmsStairClimberData,
  parseFtmsStepClimberData,
  parseFtmsTreadmillData,
  parseHeartRateMeasurement,
  parseRegisteredFtmsPayload,
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

  describe("FTMS parser registry", () => {
    it("exposes measurement and status parsers keyed by UUID", () => {
      expect(
        FTMS_PARSER_DEFINITIONS_BY_UUID[FTMS_CHARACTERISTICS.TREADMILL_DATA]?.machineType,
      ).toBe("treadmill");
      expect(getFtmsParserDefinition(FTMS_CHARACTERISTICS.STATUS)?.kind).toBe("machine_status");
    });

    it("parses registered payloads by UUID", () => {
      const result = parseRegisteredFtmsPayload(
        FTMS_CHARACTERISTICS.TREADMILL_DATA,
        toArrayBuffer([0x04, 0x05, 0x10, 0x27, 0xe8, 0x03, 0x00, 0x96, 0x00, 0x00, 0x3c, 0x00]),
      );

      expect(result?.machineType).toBe("treadmill");
      expect(result?.metrics.speedMps).toBeCloseTo(27.78, 2);
      expect(result?.metrics.distanceMeters).toBe(1000);
      expect(result?.metrics.hrBpm).toBe(150);
      expect(result?.diagnostics.truncated).toBe(false);
    });
  });

  describe("FTMS machine data parsers", () => {
    it("parses treadmill speed, distance, incline, heart rate, and elapsed time", () => {
      const flags = 0x04 | 0x08 | 0x100 | 0x400;
      const result = parseFtmsTreadmillData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x10,
          0x27,
          0xe8,
          0x03,
          0x00,
          0x7b,
          0x00,
          0x00,
          0x00,
          0x94,
          0x58,
          0x02,
        ]),
      );

      expect(result.metrics.speedMps).toBeCloseTo(27.78, 2);
      expect(result.metrics.distanceMeters).toBe(1000);
      expect(result.metrics.inclinationPercent).toBe(12.3);
      expect(result.metrics.hrBpm).toBe(148);
      expect(result.metrics.elapsedTimeSeconds).toBe(600);
    });

    it("parses cross trainer common metrics", () => {
      const flags = 0x04 | 0x08 | 0x10 | 0x80 | 0x100 | 0x200 | 0x800 | 0x2000;
      const result = parseFtmsCrossTrainerData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x88,
          0x13,
          0x40,
          0x1f,
          0x00,
          0x20,
          0x03,
          0x58,
          0x02,
          0x1e,
          0x00,
          0x50,
          0x00,
          0x00,
          0x00,
          0x00,
          0x84,
          0x20,
          0x03,
          0xfa,
          0x00,
        ]),
      );

      expect(result.metrics.distanceMeters).toBe(8000);
      expect(result.metrics.stepCount).toBe(800);
      expect(result.metrics.strideCount).toBe(600);
      expect(result.metrics.resistanceLevel).toBe(3);
      expect(result.metrics.energyKcal).toBe(80);
      expect(result.metrics.hrBpm).toBe(132);
      expect(result.metrics.elapsedTimeSeconds).toBe(800);
      expect(result.metrics.powerWatts).toBe(250);
    });

    it("parses step and stair climber MVP metrics", () => {
      const flags = 0x04 | 0x08 | 0x20 | 0x80;
      const step = parseFtmsStepClimberData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x58,
          0x02,
          0x78,
          0x00,
          0x0a,
          0x00,
          0x8c,
          0x2c,
          0x01,
        ]),
      );
      const stair = parseFtmsStairClimberData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x58,
          0x02,
          0x14,
          0x00,
          0xc8,
          0x00,
          0x8a,
          0x90,
          0x01,
        ]),
      );

      expect(step.metrics.stepCount).toBe(120);
      expect(step.metrics.floorCount).toBe(10);
      expect(step.metrics.hrBpm).toBe(140);
      expect(step.metrics.elapsedTimeSeconds).toBe(300);
      expect(stair.metrics.floorCount).toBe(20);
      expect(stair.metrics.stepCount).toBe(200);
      expect(stair.metrics.hrBpm).toBe(138);
      expect(stair.metrics.elapsedTimeSeconds).toBe(400);
    });

    it("parses rower stroke, distance, energy, heart rate, and elapsed time", () => {
      const flags = 0x04 | 0x20 | 0x40 | 0x100;
      const result = parseFtmsRowerData(
        toArrayBuffer([
          flags & 0xff,
          (flags >> 8) & 0xff,
          0x40,
          0x2c,
          0x01,
          0xf4,
          0x01,
          0x00,
          0x96,
          0x00,
          0x00,
          0x00,
          0x00,
          0x91,
          0x58,
          0x02,
        ]),
      );

      expect(result.metrics.strokeRateSpm).toBe(32);
      expect(result.metrics.strokeCount).toBe(300);
      expect(result.metrics.distanceMeters).toBe(500);
      expect(result.metrics.energyKcal).toBe(150);
      expect(result.metrics.hrBpm).toBe(145);
      expect(result.metrics.elapsedTimeSeconds).toBe(600);
    });

    it("marks truncated FTMS payloads without throwing", () => {
      const result = parseFtmsRowerData(toArrayBuffer([0x60, 0x01, 0x20]));

      expect(result.metrics.strokeRateSpm).toBe(16);
      expect(result.diagnostics.truncated).toBe(true);
    });
  });

  describe("unsignedDeltaWithWrap", () => {
    it("calculates wrapped unsigned deltas", () => {
      expect(unsignedDeltaWithWrap(2, 65534, 16)).toBe(4);
      expect(unsignedDeltaWithWrap(10, 2, 16)).toBe(8);
    });
  });
});
