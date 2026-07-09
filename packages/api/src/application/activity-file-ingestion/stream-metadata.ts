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

export interface ActivityFileStreamMetadata {
  powerStream: number[];
  hrStream: number[];
  timestamps: number[];
  cadenceStream: number[];
  altitudeStream: number[];
  speedStream: number[];
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
  const powerStream: number[] = [];
  const hrStream: number[] = [];
  const timestamps: number[] = [];
  const cadenceStream: number[] = [];
  const altitudeStream: number[] = [];
  const speedStream: number[] = [];
  const coords: ActivityFileCoordinate[] = [];
  let tempSum = 0;
  let tempCount = 0;

  for (const record of records) {
    if (record.timestamp !== undefined) timestamps.push(record.timestamp.getTime() / 1000);
    if (record.power !== undefined) powerStream.push(record.power);
    if (record.heartRate !== undefined) hrStream.push(record.heartRate);
    if (record.cadence !== undefined) cadenceStream.push(record.cadence);
    if (record.altitude !== undefined) altitudeStream.push(record.altitude);
    if (record.speed !== undefined) speedStream.push(record.speed);
    if (record.temperature !== undefined) {
      tempSum += record.temperature;
      tempCount++;
    }
    if (isValidActivityFileCoordinate(record)) {
      coords.push({ latitude: record.positionLat, longitude: record.positionLong });
    }
  }

  return {
    powerStream,
    hrStream,
    timestamps,
    cadenceStream,
    altitudeStream,
    speedStream,
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
