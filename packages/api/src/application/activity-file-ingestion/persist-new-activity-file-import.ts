import { randomUUID } from "node:crypto";
import {
  activities,
  activityGeometry,
  activityImports,
  activityLaps,
  activitySummaries,
} from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;

export interface PersistNewActivityFileImportInput {
  profileId: string;
  name: string;
  notes: string | null;
  activityType: string;
  isPrivate: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  activityFilePath: string;
  activityFileSize: number;
  importSource: string | null;
  importFileType: string | null;
  importOriginalFileName: string | null;
  calories: number | null;
  elevationGainMeters: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  normalizedSpeedMps: number | null;
  normalizedGradedSpeedMps: number | null;
  efficiencyFactor: number | null;
  aerobicDecoupling: number | null;
  avgTemperature: number | null;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps: unknown[] | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  polyline: string | null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function persistNewActivityFileImport(
  db: DbClient,
  input: PersistNewActivityFileImportInput,
) {
  const activityId = randomUUID();

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: input.name,
      notes: input.notes,
      type: input.activityType,
      is_private: input.isPrivate,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(activitySummaries).values({
      activity_id: activityId,
      profile_id: input.profileId,
      duration_seconds: input.durationSeconds,
      moving_seconds: input.movingSeconds,
      distance_meters: input.distanceMeters,
      elevation_gain_meters: input.elevationGainMeters,
      calories: input.calories,
      avg_heart_rate: input.avgHeartRate,
      max_heart_rate: input.maxHeartRate,
      avg_power: input.avgPower,
      max_power: input.maxPower,
      normalized_power: input.normalizedPower,
      avg_cadence: input.avgCadence,
      max_cadence: input.maxCadence,
      avg_speed_mps: input.avgSpeedMps,
      max_speed_mps: input.maxSpeedMps,
      normalized_speed_mps: input.normalizedSpeedMps,
      normalized_graded_speed_mps: input.normalizedGradedSpeedMps,
      efficiency_factor: input.efficiencyFactor,
      aerobic_decoupling: input.aerobicDecoupling,
      avg_temperature: input.avgTemperature,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(activityImports).values({
      activity_id: activityId,
      profile_id: input.profileId,
      activity_file_path: input.activityFilePath,
      activity_file_size: input.activityFileSize,
      import_source: input.importSource,
      import_file_type: input.importFileType,
      import_original_file_name: input.importOriginalFileName,
      device_manufacturer: toStringOrNull(input.deviceManufacturer),
      device_product: toStringOrNull(input.deviceProduct),
      created_at: now,
      updated_at: now,
    });

    if (input.mapBounds || input.polyline) {
      await tx.insert(activityGeometry).values({
        activity_id: activityId,
        profile_id: input.profileId,
        map_bounds: input.mapBounds,
        polyline: input.polyline,
        created_at: now,
        updated_at: now,
      });
    }

    if (input.laps) {
      await tx.insert(activityLaps).values(
        input.laps.map((lap, index) => ({
          id: randomUUID(),
          activity_id: activityId,
          profile_id: input.profileId,
          lap_index: index,
          payload: lap,
          created_at: now,
          updated_at: now,
        })),
      );
    }
  });

  return db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });
}
