import { randomUUID } from "node:crypto";
import type { ActivityFileType } from "@repo/core";
import {
  activities,
  activityEfforts,
  activityGeometry,
  activityImports,
  activityLaps,
  activitySummaries,
  integrationResourceLinks,
  profileMetrics,
} from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export interface ActivitySubmissionComposition<Result = unknown> {
  persist(tx: TransactionClient, context: { activityId: string; now: Date }): Promise<Result>;
}

export interface ActivitySubmission {
  kind?: "create";
  profileId: string;
  name: string;
  notes: string | null;
  activityType: string;
  activityPlanId?: string | null;
  isPrivate: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  activityFilePath?: string | null;
  activityFileSize?: number | null;
  importSource?: string | null;
  importFileType?: string | null;
  importOriginalFileName?: string | null;
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
  providerProvenance?: {
    provider: "wahoo";
    externalId: string;
    integrationId: string;
    providerUpdatedAt: string | null;
  };
  composition?: ActivitySubmissionComposition;
}

export interface ExistingActivityEnrichmentSubmission {
  kind: "enrich";
  activityId: string;
  profileId: string;
  activityFilePath: string;
  activityFileSize: number | null;
  activityFileType: ActivityFileType;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps: unknown[] | null;
  mapBounds: (typeof activityGeometry.$inferInsert)["map_bounds"];
  polyline: (typeof activityGeometry.$inferInsert)["polyline"];
  summaryValues: typeof activitySummaries.$inferInsert;
  efforts: Array<typeof activityEfforts.$inferInsert>;
  detectedLTHR: number | null;
  activityCompletedAt: Date;
  activityPlanId?: string | null;
  name?: string;
  notes?: string | null;
  activityType?: string;
  isPrivate?: boolean;
  startedAt?: Date;
  finishedAt?: Date;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

/** The sole atomic writer for the canonical activity projection. */
export async function submitActivity(
  db: DbClient,
  input: ActivitySubmission | ExistingActivityEnrichmentSubmission,
) {
  const activityId = input.kind === "enrich" ? input.activityId : randomUUID();
  let compositionResult: unknown;
  await db.transaction(async (tx) => {
    const now = new Date();
    if (input.kind === "enrich") {
      const [existing] = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)))
        .limit(1);
      if (!existing) throw new Error("Activity not found for profile");
      await tx
        .update(activities)
        .set({
          activity_plan_id:
            input.activityPlanId === undefined ? existing.activity_plan_id : input.activityPlanId,
          name: input.name ?? existing.name,
          notes: input.notes === undefined ? existing.notes : input.notes,
          type: input.activityType ?? existing.type,
          is_private: input.isPrivate ?? existing.is_private,
          started_at: input.startedAt ?? existing.started_at,
          finished_at: input.finishedAt ?? existing.finished_at,
          updated_at: now,
        })
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)));
      await tx
        .insert(activityImports)
        .values({
          activity_id: activityId,
          profile_id: input.profileId,
          activity_file_path: input.activityFilePath,
          activity_file_size: input.activityFileSize,
          import_file_type: input.activityFileType,
          device_manufacturer: stringOrNull(input.deviceManufacturer),
          device_product: stringOrNull(input.deviceProduct),
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: activityImports.activity_id,
          set: {
            activity_file_path: input.activityFilePath,
            activity_file_size: input.activityFileSize,
            import_file_type: input.activityFileType,
            device_manufacturer: stringOrNull(input.deviceManufacturer),
            device_product: stringOrNull(input.deviceProduct),
            updated_at: now,
          },
        });
      const summaryValues = {
        ...input.summaryValues,
        activity_id: activityId,
        profile_id: input.profileId,
        updated_at: now,
      };
      await tx
        .insert(activitySummaries)
        .values({ ...summaryValues, created_at: now })
        .onConflictDoUpdate({ target: activitySummaries.activity_id, set: summaryValues });
      if (input.mapBounds || input.polyline) {
        await tx
          .insert(activityGeometry)
          .values({
            activity_id: activityId,
            profile_id: input.profileId,
            map_bounds: input.mapBounds,
            polyline: input.polyline,
            created_at: now,
            updated_at: now,
          })
          .onConflictDoUpdate({
            target: activityGeometry.activity_id,
            set: {
              map_bounds: input.mapBounds,
              polyline: input.polyline,
              updated_at: now,
            },
          });
      }
      await tx.delete(activityLaps).where(eq(activityLaps.activity_id, activityId));
      if (input.laps?.length)
        await tx.insert(activityLaps).values(
          input.laps.map((payload, lap_index) => ({
            id: randomUUID(),
            activity_id: activityId,
            profile_id: input.profileId,
            lap_index,
            payload,
            created_at: now,
            updated_at: now,
          })),
        );
      await tx.delete(activityEfforts).where(eq(activityEfforts.activity_id, activityId));
      if (input.efforts.length)
        await tx.insert(activityEfforts).values(
          input.efforts.map((effort) => ({
            ...effort,
            activity_id: activityId,
            profile_id: input.profileId,
          })),
        );
      if (input.detectedLTHR)
        await tx.insert(profileMetrics).values({
          id: randomUUID(),
          created_at: now,
          profile_id: input.profileId,
          metric_type: "lthr",
          value: input.detectedLTHR,
          unit: "bpm",
          recorded_at: input.activityCompletedAt,
          reference_activity_id: activityId,
          source: "derived",
          method: "activity_file_lthr_detection",
          calculation_version: "activity-file-lthr-v1",
          provenance: { activity_id: activityId, derived_from: "activity_file_stream" },
        });
      return;
    }
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      activity_plan_id: input.activityPlanId,
      name: input.name,
      notes: input.notes,
      type: input.activityType,
      is_private: input.isPrivate,
      started_at: input.startedAt,
      finished_at: input.finishedAt,
      created_at: now,
      updated_at: now,
    });

    const summary = {
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
      updated_at: now,
    };
    await tx.insert(activitySummaries).values({ ...summary, created_at: now });

    const provenance = input.providerProvenance;
    const activityImport = {
      activity_id: activityId,
      profile_id: input.profileId,
      provider: provenance?.provider,
      external_id: provenance?.externalId,
      activity_file_path: input.activityFilePath,
      activity_file_size: input.activityFileSize,
      import_source: input.importSource,
      import_file_type: input.importFileType,
      import_original_file_name: input.importOriginalFileName,
      device_manufacturer: stringOrNull(input.deviceManufacturer),
      device_product: stringOrNull(input.deviceProduct),
      updated_at: now,
    };
    if (input.activityFilePath || provenance) {
      await tx.insert(activityImports).values({ ...activityImport, created_at: now });
    }

    if (input.mapBounds || input.polyline) {
      const geometry = {
        activity_id: activityId,
        profile_id: input.profileId,
        map_bounds: input.mapBounds,
        polyline: input.polyline,
        updated_at: now,
      };
      await tx
        .insert(activityGeometry)
        .values({ ...geometry, created_at: now })
        .onConflictDoUpdate({
          target: activityGeometry.activity_id,
          set: geometry,
        });
    }
    await tx.delete(activityLaps).where(eq(activityLaps.activity_id, activityId));
    if (input.laps?.length)
      await tx.insert(activityLaps).values(
        input.laps.map((payload, lap_index) => ({
          id: randomUUID(),
          activity_id: activityId,
          profile_id: input.profileId,
          lap_index,
          payload,
          created_at: now,
          updated_at: now,
        })),
      );

    if (provenance)
      await tx.insert(integrationResourceLinks).values({
        id: randomUUID(),
        profile_id: input.profileId,
        integration_id: provenance.integrationId,
        provider: provenance.provider,
        resource_kind: "activity",
        external_id: provenance.externalId,
        internal_resource_id: activityId,
        provider_updated_at: provenance.providerUpdatedAt
          ? new Date(provenance.providerUpdatedAt)
          : null,
        synced_at: now,
        created_at: now,
        updated_at: now,
      });
    if (input.composition) {
      compositionResult = await input.composition.persist(tx, { activityId, now });
    }
  });
  return { id: activityId, compositionResult };
}
