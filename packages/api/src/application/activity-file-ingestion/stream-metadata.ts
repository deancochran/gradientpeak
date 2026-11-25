import { calculateBounds, encodePolyline, simplifyCoordinates } from "@repo/core";

interface ActivityFileCoordinate {
  latitude: number;
  longitude: number;
}

export interface ActivityFileStreamRecord {
  timestamp?: Date;
  power?: number;
  heartRate?: number;
  cadence?: number;
  altitude?: number;
  speed?: number;
  temperature?: number;
  positionLat?: number;
  positionLong?: number;
}

/**
 * Canonical activity-file timeline. `timestampSeconds` is absolute UTC Unix
 * seconds. Every metric on the current sample describes the preceding interval
 * `(previous timestamp, current timestamp]`; the first sample anchors time.
 */
export interface ActivityFileTimelineSample {
  timestampSeconds: number;
  powerWatts: number | null;
  heartRateBpm: number | null;
  cadenceRpm: number | null;
  elevationMeters: number | null;
  speedMetersPerSecond: number | null;
}

export interface ActivityFileUnpositionedValueCounts {
  power: number;
  heartRate: number;
  cadence: number;
  elevation: number;
  speed: number;
}

export interface ActivityFileStreamMetadata {
  samples: ActivityFileTimelineSample[];
  unpositionedValueCounts: ActivityFileUnpositionedValueCounts;
  coords: ActivityFileCoordinate[];
  avgTemperature: number | null;
}

export function isValidActivityFileCoordinate(record: {
  positionLat?: number;
  positionLong?: number;
}): record is { positionLat: number; positionLong: number } {
  return (
    record.positionLat !== undefined &&
    record.positionLong !== undefined &&
    Math.abs(record.positionLat) <= 90 &&
    Math.abs(record.positionLong) <= 180 &&
    !(record.positionLat === 0 && record.positionLong === 0)
  );
}

export function collectActivityFileStreamMetadata(
  records: ActivityFileStreamRecord[],
): ActivityFileStreamMetadata {
  const samples: ActivityFileTimelineSample[] = [];
  const unpositionedValueCounts: ActivityFileUnpositionedValueCounts = {
    power: 0,
    heartRate: 0,
    cadence: 0,
    elevation: 0,
    speed: 0,
  };
  const coords: ActivityFileCoordinate[] = [];
  let tempSum = 0;
  let tempCount = 0;

  for (const record of records) {
    if (record.timestamp === undefined) {
      if (record.power !== undefined) unpositionedValueCounts.power += 1;
      if (record.heartRate !== undefined) unpositionedValueCounts.heartRate += 1;
      if (record.cadence !== undefined) unpositionedValueCounts.cadence += 1;
      if (record.altitude !== undefined) unpositionedValueCounts.elevation += 1;
      if (record.speed !== undefined) unpositionedValueCounts.speed += 1;
    } else {
      const timestampSeconds = record.timestamp.getTime() / 1_000;
      if (!Number.isFinite(timestampSeconds)) {
        throw new Error("Activity-file record timestamp must be a valid instant");
      }
      samples.push({
        timestampSeconds,
        powerWatts: record.power ?? null,
        heartRateBpm: record.heartRate ?? null,
        cadenceRpm: record.cadence ?? null,
        elevationMeters: record.altitude ?? null,
        speedMetersPerSecond: record.speed ?? null,
      });
    }
    if (record.temperature !== undefined) {
      tempSum += record.temperature;
      tempCount++;
    }
    if (isValidActivityFileCoordinate(record)) {
      coords.push({ latitude: record.positionLat, longitude: record.positionLong });
    }
  }

  return {
    samples,
    unpositionedValueCounts,
    coords,
    avgTemperature: tempCount > 0 ? tempSum / tempCount : null,
  };
}

export function buildActivityGeometry(
  records: Array<{ positionLat?: number; positionLong?: number }>,
) {
  const coords = records
    .filter(isValidActivityFileCoordinate)
    .map((record) => ({ latitude: record.positionLat, longitude: record.positionLong }));

  if (coords.length === 0) {
    return { mapBounds: null, polyline: null };
  }

  const tolerance = coords.length <= 200 ? 0 : coords.length <= 1000 ? 0.0002 : 0.0005;
  const simplified = simplifyCoordinates(coords, tolerance);

  return {
    mapBounds: calculateBounds(coords),
    polyline: encodePolyline(simplified),
  };
}
