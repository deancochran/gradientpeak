import { type CanonicalSport, canonicalSportSchema } from "@repo/core";
import { detectLTHR, estimateVO2Max } from "@repo/core/calculations";
import { activities, profileMetrics } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lte, ne } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { isClearedProfileOverride } from "../../utils/profile-override-observations";
import { fetchActivityTemperature } from "../../utils/weather";
import { calculateActivityFileStreamDerivedCalculations } from "./stream-derived-calculations";
import {
  type ActivityFileStreamRecord,
  buildActivityGeometry,
  collectActivityFileStreamMetadata,
} from "./stream-metadata";

type DbClient = Pick<ReturnType<typeof getRequiredDb>, "select">;

export interface ParsedActivityFileForAnalysis {
  metadata: {
    startTime: Date;
    type: string;
  } & Record<string, unknown>;
  summary: {
    totalTime: number;
    totalDistance: number;
    calories?: number;
    totalAscent?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgPower?: number;
    maxPower?: number;
    avgCadence?: number;
    maxCadence?: number;
    avgSpeed?: number;
    maxSpeed?: number;
  } & Record<string, unknown>;
  records: ActivityFileStreamRecord[];
  laps?: unknown[];
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export async function getLatestProfileMetricValue(
  db: DbClient,
  input: {
    profileId: string;
    metricType: "lthr" | "max_hr" | "resting_hr";
    recordedAtLte: Date;
  },
): Promise<number | null> {
  const row = await db
    .select({
      value: profileMetrics.value,
      method: profileMetrics.method,
      provenance: profileMetrics.provenance,
    })
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        eq(profileMetrics.metric_type, input.metricType),
        lte(profileMetrics.recorded_at, input.recordedAtLte),
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return row && !isClearedProfileOverride(row) ? toNumberOrNull(row.value) : null;
}

export async function getLatestSportLthrValue(
  db: DbClient,
  input: {
    profileId: string;
    activityType: CanonicalSport;
    recordedAtLte: Date;
    excludeActivityId?: string;
  },
): Promise<number | null> {
  const row = await db
    .select({
      referenceActivityId: profileMetrics.reference_activity_id,
      value: profileMetrics.value,
      method: profileMetrics.method,
      provenance: profileMetrics.provenance,
    })
    .from(profileMetrics)
    .innerJoin(activities, eq(activities.id, profileMetrics.reference_activity_id))
    .where(
      and(
        eq(profileMetrics.profile_id, input.profileId),
        eq(profileMetrics.metric_type, "lthr"),
        eq(activities.type, input.activityType),
        lte(profileMetrics.recorded_at, input.recordedAtLte),
        input.excludeActivityId
          ? ne(profileMetrics.reference_activity_id, input.excludeActivityId)
          : undefined,
      ),
    )
    .orderBy(desc(profileMetrics.recorded_at))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return row &&
    row.referenceActivityId !== input.excludeActivityId &&
    !isClearedProfileOverride(row)
    ? toNumberOrNull(row.value)
    : null;
}

/**
 * Canonical analysis boundary for any parsed activity artifact.
 *
 * Raw effort observations are derived before profile context is loaded. Profile
 * metrics can influence optional evidence promotion, but never whether effort
 * observations are collected.
 */
export async function analyzeParsedActivityFile(
  db: DbClient,
  input: {
    profileId: string;
    activityId: string;
    activityType: string;
    parsedData: ParsedActivityFileForAnalysis;
    refreshWeather?: boolean;
  },
) {
  const { summary, records } = input.parsedData;
  const startTime = input.parsedData.metadata.startTime;
  const duration = summary.totalTime;

  if (duration <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity has zero duration and cannot be processed.",
    });
  }

  const distance = summary.totalDistance || 0;
  const activityCompletedAt = new Date(startTime.getTime() + duration * 1000);
  const activityCompletedAtIso = activityCompletedAt.toISOString();
  const streamMetadata = collectActivityFileStreamMetadata(records);
  const {
    normalizedPower,
    normalizedSpeed,
    normalizedGradedSpeed,
    efficiencyFactor,
    aerobicDecoupling,
    effortsToInsert,
  } = calculateActivityFileStreamDerivedCalculations({
    activityId: input.activityId,
    profileId: input.profileId,
    activityType: input.activityType,
    distance,
    duration,
    avgHeartRate: summary.avgHeartRate,
    recordedAt: activityCompletedAt,
    streamMetadata,
  });

  let resolvedAvgTemperature = streamMetadata.avgTemperature;
  const firstCoordinate = streamMetadata.coords[0];
  if (input.refreshWeather !== false && resolvedAvgTemperature === null && firstCoordinate) {
    resolvedAvgTemperature = await fetchActivityTemperature(
      firstCoordinate.latitude,
      firstCoordinate.longitude,
      startTime,
    );
  }

  const canonicalSport = canonicalSportSchema.safeParse(input.activityType);
  const [currentSportLTHR, restingHR] = await Promise.all([
    canonicalSport.success
      ? getLatestSportLthrValue(db, {
          profileId: input.profileId,
          activityType: canonicalSport.data,
          recordedAtLte: activityCompletedAt,
          excludeActivityId: input.activityId,
        })
      : Promise.resolve(null),
    getLatestProfileMetricValue(db, {
      profileId: input.profileId,
      metricType: "resting_hr",
      recordedAtLte: activityCompletedAt,
    }),
  ]);

  const geometry = buildActivityGeometry(records);
  const detectedLTHR =
    streamMetadata.hrStream.length > 0
      ? detectLTHR(
          streamMetadata.hrStream,
          streamMetadata.hrTimestamps ?? streamMetadata.timestamps,
        )
      : null;
  if (summary.maxHeartRate && restingHR) void estimateVO2Max(summary.maxHeartRate, restingHR);

  return {
    activityCompletedAt,
    activityCompletedAtIso,
    detectedLTHR:
      detectedLTHR && (currentSportLTHR === null || detectedLTHR > currentSportLTHR)
        ? detectedLTHR
        : null,
    effortsToInsert,
    geometry,
    summaryValues: {
      activity_id: input.activityId,
      profile_id: input.profileId,
      duration_seconds: Math.round(duration),
      moving_seconds: Math.round(duration),
      distance_meters: Math.round(distance),
      elevation_gain_meters: summary.totalAscent ? Math.round(summary.totalAscent) : null,
      calories: summary.calories ? Math.round(summary.calories) : null,
      avg_heart_rate: summary.avgHeartRate ? Math.round(summary.avgHeartRate) : null,
      max_heart_rate: summary.maxHeartRate ? Math.round(summary.maxHeartRate) : null,
      avg_power: summary.avgPower ? Math.round(summary.avgPower) : null,
      max_power: summary.maxPower ? Math.round(summary.maxPower) : null,
      normalized_power: normalizedPower ? Math.round(normalizedPower) : null,
      avg_cadence: summary.avgCadence ? Math.round(summary.avgCadence) : null,
      max_cadence: summary.maxCadence ? Math.round(summary.maxCadence) : null,
      avg_speed_mps: summary.avgSpeed ?? (distance && duration ? distance / duration : null),
      max_speed_mps: summary.maxSpeed ?? null,
      normalized_speed_mps: normalizedSpeed || null,
      normalized_graded_speed_mps: normalizedGradedSpeed || null,
      efficiency_factor: efficiencyFactor || null,
      aerobic_decoupling: aerobicDecoupling || null,
      avg_temperature: resolvedAvgTemperature ? Math.round(resolvedAvgTemperature) : null,
      updated_at: new Date(),
    },
    startedAt: startTime,
  };
}

export type ParsedActivityFileAnalysis = Awaited<ReturnType<typeof analyzeParsedActivityFile>>;
