/**
 * Pure sensor data parsing utilities for BLE and GPS sensors
 * These functions handle standard GATT characteristics and location data
 */

import type {
  PublicActivityMetric,
  PublicActivityMetricDataType,
} from "../types";

// ================================
// BLE GATT Service UUIDs
// ================================

export const GATT_SERVICES = {
  HEART_RATE: "0000180d-0000-1000-8000-00805f9b34fb",
  CYCLING_POWER: "00001818-0000-1000-8000-00805f9b34fb",
  CYCLING_SPEED_CADENCE: "00001816-0000-1000-8000-00805f9b34fb",
  RUNNING_SPEED_CADENCE: "00001814-0000-1000-8000-00805f9b34fb",
  DEVICE_INFORMATION: "0000180a-0000-1000-8000-00805f9b34fb",
} as const;

export const GATT_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "00002a37-0000-1000-8000-00805f9b34fb",
  CYCLING_POWER_MEASUREMENT: "00002a63-0000-1000-8000-00805f9b34fb",
  CSC_MEASUREMENT: "00002a5b-0000-1000-8000-00805f9b34fb",
  RSC_MEASUREMENT: "00002a53-0000-1000-8000-00805f9b34fb",
} as const;

// ================================
// Sensor Data Types
// ================================

export interface SensorReading {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  value: number | boolean | [number, number];
  timestamp: number;
  deviceId?: string;
  quality?: "good" | "poor" | "unknown";
}

export interface GPSReading {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: number;
}

// ================================
// Heart Rate Parsing
// ================================

/**
 * Parse Heart Rate Measurement characteristic data
 * Format: https://www.bluetooth.com/specifications/specs/heart-rate-service/
 */
export function parseHeartRate(data: ArrayBuffer): SensorReading | null {
  if (data.byteLength < 2) return null;

  const view = new DataView(data);
  const flags = view.getUint8(0);

  // Check if heart rate is 16-bit (bit 0 of flags)
  const is16Bit = (flags & 0x01) !== 0;
  const heartRate = is16Bit ? view.getUint16(1, true) : view.getUint8(1);

  // Validate reasonable heart rate range
  if (heartRate < 30 || heartRate > 250) return null;

  return {
    metric: "heartrate",
    dataType: "integer",
    value: heartRate,
    timestamp: Date.now(),
    quality: heartRate > 40 && heartRate < 200 ? "good" : "poor",
  };
}

// ================================
// Cycling Power Parsing
// ================================

/**
 * Parse Cycling Power Measurement characteristic data
 * Format: https://www.bluetooth.com/specifications/specs/cycling-power-service/
 */
export function parseCyclingPower(data: ArrayBuffer): SensorReading[] {
  if (data.byteLength < 4) return [];

  const readings: SensorReading[] = [];
  const view = new DataView(data);
  const flags = view.getUint16(0, true);

  // Instantaneous power is always present at bytes 2-3
  const power = view.getInt16(2, true);

  if (power >= 0 && power <= 2000) {
    // Reasonable power range
    readings.push({
      metric: "power",
      dataType: "integer",
      value: power,
      timestamp: Date.now(),
      quality: power > 0 ? "good" : "unknown",
    });
  }

  let offset = 4;

  // Parse optional fields based on flags
  if (flags & 0x01) {
    // Pedal Power Balance Present
    offset += 1;
  }

  if (flags & 0x02) {
    // Pedal Power Balance Reference
    // No additional data, just reference bit
  }

  if (flags & 0x04) {
    // Accumulated Torque Present
    offset += 2;
  }

  if (flags & 0x10) {
    // Wheel Revolution Data Present
    if (data.byteLength >= offset + 6) {
      const revolutions = view.getUint32(offset, true);
      const lastWheelEventTime = view.getUint16(offset + 4, true);
      offset += 6;

      // Calculate speed if we have previous data (handled by caller)
      readings.push({
        metric: "speed",
        dataType: "float",
        value: 0, // Will be calculated from revolution data
        timestamp: Date.now(),
        quality: "good",
      });
    }
  }

  if (flags & 0x20) {
    // Crank Revolution Data Present
    if (data.byteLength >= offset + 4) {
      const crankRevolutions = view.getUint16(offset, true);
      const lastCrankEventTime = view.getUint16(offset + 2, true);

      // Calculate cadence if we have previous data (handled by caller)
      readings.push({
        metric: "cadence",
        dataType: "integer",
        value: 0, // Will be calculated from revolution data
        timestamp: Date.now(),
        quality: "good",
      });
    }
  }

  return readings;
}

// ================================
// Cycling Speed & Cadence Parsing
// ================================

/**
 * Parse CSC Measurement characteristic data
 * Format: https://www.bluetooth.com/specifications/specs/cycling-speed-and-cadence-service/
 */
export function parseCSCMeasurement(data: ArrayBuffer): SensorReading[] {
  if (data.byteLength < 1) return [];

  const readings: SensorReading[] = [];
  const view = new DataView(data);
  const flags = view.getUint8(0);
  let offset = 1;

  // Wheel Revolution Data Present
  if (flags & 0x01) {
    if (data.byteLength >= offset + 6) {
      const wheelRevolutions = view.getUint32(offset, true);
      const lastWheelEventTime = view.getUint16(offset + 4, true);
      offset += 6;

      readings.push({
        metric: "speed",
        dataType: "float",
        value: 0, // Calculated from revolutions
        timestamp: Date.now(),
        quality: "good",
      });
    }
  }

  // Crank Revolution Data Present
  if (flags & 0x02) {
    if (data.byteLength >= offset + 4) {
      const crankRevolutions = view.getUint16(offset, true);
      const lastCrankEventTime = view.getUint16(offset + 2, true);

      readings.push({
        metric: "cadence",
        dataType: "integer",
        value: 0, // Calculated from revolutions
        timestamp: Date.now(),
        quality: "good",
      });
    }
  }

  return readings;
}

// ================================
// GPS Data Processing
// ================================

/**
 * Process GPS location data into activity metrics
 */
export function processGPSReading(
  reading: GPSReading,
  previousReading?: GPSReading,
): SensorReading[] {
  const readings: SensorReading[] = [];
  const timestamp = reading.timestamp;

  // Add coordinate data
  readings.push({
    metric: "latlng",
    dataType: "latlng",
    value: [reading.latitude, reading.longitude],
    timestamp,
    quality: reading.accuracy && reading.accuracy < 10 ? "good" : "poor",
  });

  // Add altitude if available
  if (reading.altitude !== undefined) {
    readings.push({
      metric: "altitude",
      dataType: "float",
      value: reading.altitude,
      timestamp,
      quality: "good",
    });
  }

  // Calculate speed and distance if we have a previous reading
  if (previousReading && reading.speed !== undefined) {
    // Use GPS-reported speed if available
    readings.push({
      metric: "speed",
      dataType: "float",
      value: reading.speed, // m/s
      timestamp,
      quality: "good",
    });
  } else if (previousReading) {
    // Calculate speed from position changes
    const distance = calculateDistance(
      previousReading.latitude,
      previousReading.longitude,
      reading.latitude,
      reading.longitude,
    );

    const timeDelta = (timestamp - previousReading.timestamp) / 1000; // seconds

    if (timeDelta > 0) {
      const speed = distance / timeDelta; // m/s

      readings.push({
        metric: "speed",
        dataType: "float",
        value: speed,
        timestamp,
        quality: timeDelta > 0.5 ? "good" : "poor", // Need reasonable time delta
      });

      readings.push({
        metric: "distance",
        dataType: "float",
        value: distance,
        timestamp,
        quality: "good",
      });
    }
  }

  return readings;
}

// ================================
// Utility Functions
// ================================

/**
 * Calculate distance between two GPS points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate elevation gradient between two points
 * Returns gradient as percentage
 */
export function calculateGradient(
  elevation1: number,
  elevation2: number,
  distance: number,
): number {
  if (distance === 0) return 0;

  const elevationChange = elevation2 - elevation1;
  return (elevationChange / distance) * 100;
}

/**
 * Smooth sensor data using simple moving average
 */
export function smoothSensorData(
  values: number[],
  windowSize: number = 3,
): number[] {
  if (values.length < windowSize) return values;

  const smoothed: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, start + windowSize);

    const sum = values.slice(start, end).reduce((acc, val) => acc + val, 0);
    smoothed.push(sum / (end - start));
  }

  return smoothed;
}

/**
 * Validate sensor reading against expected ranges
 */
export function validateSensorReading(reading: SensorReading): boolean {
  switch (reading.metric) {
    case "heartrate":
      return (
        typeof reading.value === "number" &&
        reading.value >= 30 &&
        reading.value <= 250
      );

    case "power":
      return (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 2500
      );

    case "cadence":
      return (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 300
      );

    case "speed":
      return (
        typeof reading.value === "number" &&
        reading.value >= 0 &&
        reading.value <= 100
      ); // m/s (360 km/h max)

    case "altitude":
      return (
        typeof reading.value === "number" &&
        reading.value >= -1000 &&
        reading.value <= 10000
      ); // meters

    case "latlng":
      return (
        Array.isArray(reading.value) &&
        reading.value.length === 2 &&
        Math.abs(reading.value[0]) <= 90 &&
        Math.abs(reading.value[1]) <= 180
      );

    default:
      return true;
  }
}
