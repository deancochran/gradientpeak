/**
 * BLE sensor parsing utilities
 */

import type {
  PublicActivityMetric,
  PublicActivityMetricDataType,
} from "../types";

/** --- Metric Types --- */
export enum BleMetricType {
  HeartRate = "heartrate",
  CyclingPower = "power",
  Cadence = "cadence",
  Speed = "speed",
}

/** --- Standard BLE Characteristics --- */
export const KnownCharacteristics: Record<string, BleMetricType> = {
  "00002a37-0000-1000-8000-00805f9b34fb": BleMetricType.HeartRate,
  "00002a63-0000-1000-8000-00805f9b34fb": BleMetricType.CyclingPower,
  "00002a5b-0000-1000-8000-00805f9b34fb": BleMetricType.Cadence, // Speed can be derived
};

/** --- Sensor Data Types --- */
export interface SensorReading {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  value: number | [number, number];
  timestamp: number;
  deviceId: string;
}

/** --- BLE Parsers --- */

/** Parse Heart Rate as a single reading */
export function parseHeartRate(
  data: ArrayBuffer,
  deviceId: string,
): SensorReading | null {
  if (data.byteLength < 2) return null;
  const view = new DataView(data);
  const is16Bit = (view.getUint8(0) & 0x01) !== 0;
  const value = is16Bit ? view.getUint16(1, true) : view.getUint8(1);

  if (value < 30 || value > 250) return null;

  return validateSensorReading({
    metric: "heartrate",
    dataType: "integer",
    value,
    timestamp: Date.now(),
    deviceId,
  });
}

/** Parse Cycling Power as a single reading */
export function parseCyclingPower(
  data: ArrayBuffer,
  deviceId: string,
): SensorReading | null {
  if (data.byteLength < 4) return null;
  const view = new DataView(data);
  const power = view.getInt16(2, true);
  const value = Math.max(0, Math.min(power, 2000));
  return validateSensorReading({
    metric: "power",
    dataType: "integer",
    value,
    timestamp: Date.now(),
    deviceId,
  });
}

/** Parse CSC Measurement as a single reading (either cadence or speed) */
export function parseCSCMeasurement(
  data: ArrayBuffer,
  deviceId: string,
): SensorReading | null {
  if (data.byteLength < 1) return null;
  const view = new DataView(data);
  const flags = view.getUint8(0);
  let offset = 1;

  // prioritize speed if present
  if (flags & 0x01 && data.byteLength >= offset + 6) {
    const value = view.getUint32(offset, true);
    return validateSensorReading({
      metric: "speed",
      dataType: "float",
      value,
      timestamp: Date.now(),
      deviceId,
    });
  }

  if (flags & 0x02 && data.byteLength >= offset + 4) {
    const value = view.getUint16(offset, true);
    return validateSensorReading({
      metric: "cadence",
      dataType: "integer",
      value,
      timestamp: Date.now(),
      deviceId,
    });
  }

  return null;
}

/** --- Wrapper function to replace handleData switch case --- */
export function parseBleData(
  metricType: BleMetricType,
  raw: ArrayBuffer,
  deviceId: string,
): SensorReading | null {
  switch (metricType) {
    case BleMetricType.HeartRate:
      return parseHeartRate(raw, deviceId);
    case BleMetricType.CyclingPower:
      return parseCyclingPower(raw, deviceId);
    case BleMetricType.Cadence:
    case BleMetricType.Speed: // speed derived from CSC
      return parseCSCMeasurement(raw, deviceId);
    default:
      return null;
  }
}

/** --- Utilities --- */
export function smoothSensorData(values: number[], window = 3): number[] {
  if (values.length < window) return values;
  return values.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, start + window);
    return values.slice(start, end).reduce((a, b) => a + b, 0) / (end - start);
  });
}

function validateSensorReading(reading: SensorReading): SensorReading | null {
  switch (reading.metric) {
    case "heartrate":
      if (
        typeof reading.value === "number" &&
        reading.value >= 30 &&
        reading.value <= 250
      ) {
        return reading;
      }
    case "power":
      if (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 2500
      ) {
        return reading;
      }
    case "cadence":
      if (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 300
      ) {
        return reading;
      }
    case "speed":
      if (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 100
      ) {
        return reading;
      }
    default:
      return null;
  }
}
