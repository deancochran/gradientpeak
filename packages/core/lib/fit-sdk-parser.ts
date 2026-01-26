/// <reference path="../types/garmin-fitsdk.d.ts" />
/**
 * FIT File Parser using Garmin FIT SDK
 *
 * Provides a robust, production-ready FIT file parser.
 */
import { Decoder, Stream, Utils } from "@garmin/fitsdk";
import type { StandardActivity } from "../types/normalization";

const SEMICIRCLE_TO_DEGREES = 180 / 2147483648;

function toDegrees(semicircles: number | undefined): number | undefined {
  if (semicircles === undefined || semicircles === null) return undefined;
  return semicircles * SEMICIRCLE_TO_DEGREES;
}

// Helper to convert snake_case to camelCase
const toCamelCase = (s: string): string => {
  return s.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace("-", "").replace("_", "");
  });
};

// Helper to recursively normalize object keys
const normalizeKeys = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map((v) => normalizeKeys(v));
  } else if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((result, key) => {
      result[toCamelCase(key)] = normalizeKeys(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
};

interface FitDecodeResult {
  messages: any | null;
  errors: { type: string; message: string }[];
}

/**
 * Safely decodes a FIT file buffer with robust error handling and data normalization.
 * @param buffer The FIT file content as a Buffer.
 * @returns An object containing the decoded messages and any errors.
 */
export function safeDecodeFitFile(buffer: Buffer): FitDecodeResult {
  const result: FitDecodeResult = { messages: null, errors: [] };

  try {
    const stream = Stream.fromBuffer(buffer);

    // 1. Quick check: Is it even a FIT file?
    if (!Decoder.isFIT(stream)) {
      result.errors.push({
        type: "format",
        message: "File is not in FIT format.",
      });
      return result;
    }

    const decoder = new Decoder(stream);

    // 2. Crucial check: Validate header and file CRC
    if (!decoder.checkIntegrity()) {
      result.errors.push({
        type: "integrity",
        message: "File integrity check failed. The file may be corrupt.",
      });
      // You could still try to decode, but it's risky. Best to stop here.
      return result;
    }

    // 3. Attempt to read all messages
    const { messages: rawMessages, errors: decodeErrors } = decoder.read({
      // Use options for better data handling
      applyScaleAndOffset: true, // Convert raw values to real-world units
      convertDateTimesToDates: true, // Convert FIT timestamps to JS Date objects
      convertTypesToStrings: true, // Convert enums to readable strings
      mergeHeartRates: true, // Merge separate HRV data into record messages
    });

    if (decodeErrors.length > 0) {
      decodeErrors.forEach((err) => {
        result.errors.push({
          type: "decode",
          message: `Error at offset ${err.offset}: ${err.message}`,
        });
      });
    }

    // 4. Normalize all keys to camelCase for consistent access
    result.messages = normalizeKeys(rawMessages);
  } catch (e) {
    result.errors.push({
      type: "system",
      message: `An unexpected error occurred: ${
        e instanceof Error ? e.message : String(e)
      }`,
    });
  }

  return result;
}

/**
 * Parses a FIT file buffer into a standardized activity format.
 * This is the primary function for decoding FIT files.
 *
 * @param buffer The FIT file data as a Buffer or Uint8Array.
 * @returns A StandardActivity object.
 */
export function parseFitFileWithSDK(
  buffer: Buffer | Uint8Array,
): StandardActivity {
  const { messages, errors } = safeDecodeFitFile(Buffer.from(buffer));

  if (errors.length > 0) {
    console.warn("FIT decoding warnings:", errors);
  }

  if (!messages) {
    throw new Error("Failed to decode FIT file.");
  }

  const fileId = messages.fileIdMesgs?.[0];
  const activityInfo = messages.activityMesgs?.[0];
  const session = messages.sessionMesgs?.[0];
  const laps = messages.lapMesgs || [];
  const lengths = messages.lengthMesgs || [];
  const records = messages.recordMesgs || [];

  if (!session) {
    throw new Error(
      "No session message found in FIT file. Cannot process activity.",
    );
  }

  const toDate = (val: any): Date => {
    if (val instanceof Date) return val;
    if (typeof val === "number") return Utils.convertDateTimeToDate(val);
    // Return a default or throw an error if the date is invalid
    return new Date();
  };

  const activity: StandardActivity = {
    metadata: {
      startTime: toDate(session.startTime),
      type: session.sport || "generic",
      subType: session.subSport,
      manufacturer: fileId?.manufacturer,
      product: fileId?.product?.toString(),
    },
    summary: {
      // Best practice: Prefer activity message, but fallback to session if activity is missing or has a zero time
      totalTime:
        (activityInfo?.totalTimerTime && activityInfo.totalTimerTime > 0
          ? activityInfo.totalTimerTime
          : session.totalTimerTime) ?? 0,
      totalDistance:
        activityInfo?.totalDistance ?? session.totalDistance ?? 0,
      totalAscent: activityInfo?.totalAscent ?? session.totalAscent,
      totalDescent: activityInfo?.totalDescent ?? session.totalDescent,
      maxSpeed: session.maxSpeed,
      avgSpeed: session.avgSpeed,
      maxHeartRate: session.maxHeartRate,
      avgHeartRate: session.avgHeartRate,
      maxCadence: session.maxCadence,
      avgCadence: session.avgCadence,
      maxPower: session.maxPower,
      avgPower: session.avgPower,
      calories: activityInfo?.totalCalories ?? session.totalCalories,
      poolLength: session.poolLength,
      poolLengthUnit: session.poolLengthUnit,
      totalStrokes: session.totalStrokes,
      avgStrokeDistance: session.avgStrokeDistance,
    },
    laps: laps.map((lap: any) => ({
      startTime: toDate(lap.startTime),
      totalTime: lap.totalTimerTime ?? 0,
      totalDistance: lap.totalDistance ?? 0,
      avgSpeed: lap.avgSpeed,
      avgHeartRate: lap.avgHeartRate,
      avgCadence: lap.avgCadence,
      avgPower: lap.avgPower,
    })),
    lengths: lengths.map((length: any) => ({
      startTime: toDate(length.startTime),
      totalElapsedTime: length.totalElapsedTime,
      totalTimerTime: length.totalTimerTime,
      totalStrokes: length.totalStrokes,
      avgSpeed: length.avgSpeed,
      swimStroke: length.swimStroke,
      avgSwimmingCadence: length.avgSwimmingCadence,
      event: length.event,
      eventType: length.eventType,
    })),
    records: records.map((record: any) => ({
      timestamp: toDate(record.timestamp),
      positionLat: record.positionLat,
      positionLong: record.positionLong,
      distance: record.distance,
      altitude: record.enhancedAltitude ?? record.altitude,
      speed: record.enhancedSpeed ?? record.speed,
      heartRate: record.heartRate,
      cadence: record.cadence,
      power: record.power,
      temperature: record.temperature,
    })),
  };

  // The SDK's `applyScaleAndOffset` should convert semicircles to degrees.
  // However, as a fallback, we check if the value is still in the semicircle range.
  const firstRecord = activity.records.find(
    (r) => r.positionLat !== undefined && r.positionLat !== null,
  );
  if (firstRecord && Math.abs(firstRecord.positionLat!) > 180) {
    activity.records.forEach((r) => {
      if (r.positionLat) r.positionLat = toDegrees(r.positionLat);
      if (r.positionLong) r.positionLong = toDegrees(r.positionLong);
    });
  }

  return activity;
}

/**
 * Get heart rate zones from FIT data
 */
export function extractHeartRateZones(records: any[]): {
  zone1: number; // < 50% max
  zone2: number; // 50-60% max
  zone3: number; // 60-70% max
  zone4: number; // 70-80% max
  zone5: number; // 80-90% max
  zone6: number; // > 90% max
} {
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0, zone6: 0 };

  const heartRates = records
    .map((r) => r.heartRate)
    .filter((hr): hr is number => hr !== undefined && hr > 0);

  if (heartRates.length === 0) return zones;

  const maxHR = Math.max(...heartRates);

  heartRates.forEach((hr) => {
    const percentMax = hr / maxHR;
    if (percentMax < 0.5) zones.zone1++;
    else if (percentMax < 0.6) zones.zone2++;
    else if (percentMax < 0.7) zones.zone3++;
    else if (percentMax < 0.8) zones.zone4++;
    else if (percentMax < 0.9) zones.zone5++;
    else zones.zone6++;
  });

  return zones;
}

/**
 * Get power zones from FIT data
 */
export function extractPowerZones(records: any[]): {
  zone1: number; // < 55% FTP
  zone2: number; // 55-75% FTP
  zone3: number; // 75-90% FTP
  zone4: number; // 90-105% FTP
  zone5: number; // 105-120% FTP
  zone6: number; // > 120% FTP
} {
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0, zone6: 0 };

  const powers = records
    .map((r) => r.power)
    .filter((p): p is number => p !== undefined && p > 0);

  if (powers.length === 0) return zones;

  // Estimate FTP from 20-minute max power if available
  const max20MinPower = calculate20MinMaxPower(powers);
  const estimatedFTP = max20MinPower * 0.95; // Common FTP estimation

  powers.forEach((power) => {
    const percentFTP = power / estimatedFTP;
    if (percentFTP < 0.55) zones.zone1++;
    else if (percentFTP < 0.75) zones.zone2++;
    else if (percentFTP < 0.9) zones.zone3++;
    else if (percentFTP < 1.05) zones.zone4++;
    else if (percentFTP < 1.2) zones.zone5++;
    else zones.zone6++;
  });

  return zones;
}

/**
 * Calculate 20-minute maximum power from power data
 */
function calculate20MinMaxPower(powers: number[]): number {
  if (powers.length < 20 * 60) return Math.max(...powers); // Less than 20 minutes available

  const windowSize = 20 * 60; // 20 minutes in seconds
  let maxAvgPower = 0;

  // Sliding window average
  for (let i = 0; i <= powers.length - windowSize; i++) {
    const window = powers.slice(i, i + windowSize);
    const avgPower = window.reduce((sum, p) => sum + p, 0) / window.length;
    maxAvgPower = Math.max(maxAvgPower, avgPower);
  }

  return maxAvgPower;
}

/**
 * Validates a FIT file's format and integrity.
 * @param data The FIT file data as an ArrayBuffer.
 * @returns True if the file is a valid FIT file, false otherwise.
 */
export function validateFitFileWithSDK(data: ArrayBuffer): boolean {
  try {
    const stream = Stream.fromArrayBuffer(data);
    if (!Decoder.isFIT(stream)) {
      return false;
    }
    const decoder = new Decoder(stream);
    return decoder.checkIntegrity();
  } catch {
    return false;
  }
}
