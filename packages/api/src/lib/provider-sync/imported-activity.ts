import { encodePolyline, type StandardActivity, simplifyCoordinates } from "@repo/core";

export type ImportedActivityProvider = "wahoo";

export type ImportedActivityCreateInput = {
  activityFilePath: string;
  activityFileSize: number;
  activityPlanId: string | null;
  avgCadence: number | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  avgSpeedMps: number | null;
  calories: number | null;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number | null;
  externalId: string;
  finishedAt: string;
  integrationId: string;
  movingSeconds: number;
  name: string;
  normalizedPower: number | null;
  polyline: string | null;
  profileId: string;
  provider: ImportedActivityProvider;
  providerUpdatedAt: string | null;
  startedAt: string;
  type: string;
};

export type BuildImportedActivityInput = {
  activityFile: {
    path: string;
    size: number;
  };
  activityPlanId: string | null;
  externalId: string;
  fallback: {
    avgCadence?: number | string | null;
    avgHeartRate?: number | string | null;
    avgPower?: number | string | null;
    avgSpeedMps?: number | string | null;
    calories?: number | string | null;
    distanceMeters?: number | string | null;
    durationSeconds?: number | string | null;
    elevationGainMeters?: number | string | null;
    movingSeconds?: number | string | null;
    normalizedPower?: number | string | null;
    providerUpdatedAt?: string | null;
    startedAt: string;
  };
  integrationId: string;
  parsedActivity: StandardActivity | null;
  profileId: string;
  provider: ImportedActivityProvider;
  title: string;
  type: string;
};

export function buildImportedActivityCreateInput(
  input: BuildImportedActivityInput,
): ImportedActivityCreateInput {
  const startedAt =
    input.parsedActivity?.metadata.startTime.toISOString() ?? input.fallback.startedAt;
  const durationSeconds = toInteger(
    input.parsedActivity?.summary.totalTime ?? input.fallback.durationSeconds,
  );

  return {
    activityFilePath: input.activityFile.path,
    activityFileSize: input.activityFile.size,
    activityPlanId: input.activityPlanId,
    avgCadence: toNullableInteger(
      input.parsedActivity?.summary.avgCadence ?? input.fallback.avgCadence,
    ),
    avgHeartRate: toNullableInteger(
      input.parsedActivity?.summary.avgHeartRate ?? input.fallback.avgHeartRate,
    ),
    avgPower: toNullableNumber(input.parsedActivity?.summary.avgPower ?? input.fallback.avgPower),
    avgSpeedMps: toNullableNumber(
      input.parsedActivity?.summary.avgSpeed ?? input.fallback.avgSpeedMps,
    ),
    calories: toNullableInteger(input.parsedActivity?.summary.calories ?? input.fallback.calories),
    distanceMeters: toInteger(
      input.parsedActivity?.summary.totalDistance ?? input.fallback.distanceMeters,
    ),
    durationSeconds,
    elevationGainMeters: toNullableInteger(
      input.parsedActivity?.summary.totalAscent ?? input.fallback.elevationGainMeters,
    ),
    externalId: input.externalId,
    finishedAt: new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString(),
    integrationId: input.integrationId,
    movingSeconds: toInteger(
      input.parsedActivity?.summary.totalTime ?? input.fallback.movingSeconds,
    ),
    name: input.title,
    normalizedPower: toNullableNumber(input.fallback.normalizedPower),
    polyline: buildActivityPolyline(input.parsedActivity),
    profileId: input.profileId,
    provider: input.provider,
    providerUpdatedAt: input.fallback.providerUpdatedAt ?? null,
    startedAt,
    type: input.type,
  };
}

function buildActivityPolyline(parsedActivity: StandardActivity | null): string | null {
  const coordinates = (parsedActivity?.records ?? [])
    .filter(
      (record) =>
        typeof record.positionLat === "number" &&
        typeof record.positionLong === "number" &&
        Math.abs(record.positionLat) <= 90 &&
        Math.abs(record.positionLong) <= 180 &&
        !(record.positionLat === 0 && record.positionLong === 0),
    )
    .map((record) => ({
      latitude: record.positionLat!,
      longitude: record.positionLong!,
      altitude: record.altitude,
    }));

  if (coordinates.length < 2) {
    return null;
  }

  try {
    return encodePolyline(simplifyCoordinates(coordinates));
  } catch (error) {
    console.warn("Failed to encode imported activity polyline", error);
    return null;
  }
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: number | string | null | undefined): number {
  return Math.round(toNumber(value));
}

function toNullableInteger(value: number | string | null | undefined): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed);
}
