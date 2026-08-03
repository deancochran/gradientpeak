import {
  type ContentVisibility,
  encodePolyline,
  type StandardActivity,
  simplifyCoordinates,
} from "@repo/core";

export type ImportedActivityProvider = "wahoo";

export type ImportedActivityRequiredMetric = "distanceMeters" | "durationSeconds";
export type ImportedActivityMetricRejectionReason = "invalid_source" | "missing_source";

/** Required persisted metrics fail closed instead of turning unavailable evidence into zero. */
export class ImportedActivityMetricResolutionError extends Error {
  readonly metric: ImportedActivityRequiredMetric;
  readonly reason: ImportedActivityMetricRejectionReason;

  constructor(
    metric: ImportedActivityRequiredMetric,
    reason: ImportedActivityMetricRejectionReason,
  ) {
    super(`Imported activity ${metric} has ${reason.replace("_", " ")}`);
    this.metric = metric;
    this.reason = reason;
  }
}

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
  integrationGeneration: number;
  contentVisibility: ContentVisibility;
  /** Provider-reported active duration; this is not inferred moving time. */
  providerActiveDurationSeconds: number | null;
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
    providerActiveDurationSeconds?: number | string | null;
    normalizedPower?: number | string | null;
    providerUpdatedAt?: string | null;
    startedAt: string;
  };
  integrationId: string;
  integrationGeneration: number;
  parsedActivity: StandardActivity | null;
  profileId: string;
  provider: ImportedActivityProvider;
  title: string;
  type: string;
};

/** Selects one finite, nonnegative source for every required imported-activity metric. */
export function resolveImportedActivityRequiredMetrics(input: {
  fileDistanceMeters: number | undefined;
  fileDurationSeconds: number | undefined;
  providerDistanceMeters: number | string | null | undefined;
  providerDurationSeconds: number | string | null | undefined;
}): { distanceMeters: number; durationSeconds: number } {
  return {
    distanceMeters: resolveRequiredMetric({
      metric: "distanceMeters",
      fileValue: input.fileDistanceMeters,
      providerValue: input.providerDistanceMeters,
    }),
    durationSeconds: resolveRequiredMetric({
      metric: "durationSeconds",
      fileValue: input.fileDurationSeconds,
      providerValue: input.providerDurationSeconds,
    }),
  };
}

export function buildImportedActivityCreateInput(
  input: BuildImportedActivityInput,
): ImportedActivityCreateInput {
  const startedAt =
    input.parsedActivity?.metadata.startTime.toISOString() ?? input.fallback.startedAt;
  const resolvedMetrics = resolveImportedActivityRequiredMetrics({
    fileDistanceMeters: input.parsedActivity?.summary.totalDistance,
    fileDurationSeconds: input.parsedActivity?.summary.totalTime,
    providerDistanceMeters: input.fallback.distanceMeters,
    providerDurationSeconds: input.fallback.durationSeconds,
  });
  const durationSeconds = Math.round(resolvedMetrics.durationSeconds);
  const distanceMeters = Math.round(resolvedMetrics.distanceMeters);

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
    distanceMeters,
    durationSeconds,
    elevationGainMeters: toNullableInteger(
      input.parsedActivity?.summary.totalAscent ?? input.fallback.elevationGainMeters,
    ),
    externalId: input.externalId,
    finishedAt: new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString(),
    integrationId: input.integrationId,
    integrationGeneration: input.integrationGeneration,
    contentVisibility: "private",
    providerActiveDurationSeconds: toPositiveFiniteNumber(
      input.fallback.providerActiveDurationSeconds,
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
  const coordinates = (parsedActivity?.records ?? []).flatMap((record) => {
    const latitude = record.positionLat;
    const longitude = record.positionLong;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      return [];
    }
    return [{ latitude, longitude, altitude: record.altitude }];
  });

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

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInteger(value: number | string | null | undefined): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function toPositiveFiniteNumber(value: number | string | null | undefined): number | null {
  const parsed = toNullableNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

type MetricSourceResolution =
  | { status: "available"; value: number }
  | { status: "unavailable"; reason: ImportedActivityMetricRejectionReason };

function resolveMetricSource(value: number | string | null | undefined): MetricSourceResolution {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { status: "unavailable", reason: "missing_source" };
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? { status: "available", value: parsed }
    : { status: "unavailable", reason: "invalid_source" };
}

function resolveRequiredMetric(input: {
  metric: ImportedActivityRequiredMetric;
  fileValue: number | undefined;
  providerValue: number | string | null | undefined;
}): number {
  const file = resolveMetricSource(input.fileValue);
  if (file.status === "available") return file.value;

  const provider = resolveMetricSource(input.providerValue);
  if (provider.status === "available") return provider.value;

  throw new ImportedActivityMetricResolutionError(
    input.metric,
    file.reason === "invalid_source" || provider.reason === "invalid_source"
      ? "invalid_source"
      : "missing_source",
  );
}
