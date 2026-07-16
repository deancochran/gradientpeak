import { createHash, randomUUID } from "node:crypto";
import { activityLapRecordListSchema } from "@repo/core";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import {
  activities,
  type activityEfforts,
  activityFileIngestions,
  integrationResourceLinks,
} from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { reconcileGeneratedActivityEvidence } from "./reconcile-activity-evidence";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export function recordingSessionActivityId(profileId: string, sessionId: string): string {
  const hash = createHash("sha256").update(`${profileId}:${sessionId}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface ActivitySubmissionComposition<Result = unknown> {
  persist(tx: TransactionClient, context: { activityId: string; now: Date }): Promise<Result>;
}

export interface ActivitySubmission {
  kind?: "create";
  requestedActivityId?: string;
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
  poolLength?: number | null;
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
  analysis?: {
    efforts: Array<typeof activityEfforts.$inferInsert>;
    detectedLTHR: number | null;
    activityCompletedAt: Date;
    ingestion?: {
      source: "manual_import" | "provider_sync";
      provider?: "wahoo" | null;
      externalId?: string | null;
      fileType: ActivityFileType;
    };
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
  laps?: unknown[] | null;
  mapBounds?: (typeof activities.$inferInsert)["map_bounds"];
  polyline?: (typeof activities.$inferInsert)["polyline"];
  summaryValues: Partial<typeof activities.$inferInsert> & {
    activity_id?: string;
    profile_id?: string;
  };
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
  ingestion?: {
    source: "manual_import" | "provider_sync";
    provider?: "wahoo" | null;
    externalId?: string | null;
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function persistReadyActivityFileIngestion(
  tx: TransactionClient,
  input: {
    activityId: string;
    profileId: string;
    source: "manual_import" | "provider_sync";
    provider?: "wahoo" | null;
    externalId?: string | null;
    filePath: string | null;
    fileSize: number | null;
    fileType: ActivityFileType;
    now: Date;
  },
) {
  await tx
    .delete(activityFileIngestions)
    .where(
      and(
        eq(activityFileIngestions.activity_id, input.activityId),
        eq(activityFileIngestions.source, input.source),
      ),
    );
  await tx.insert(activityFileIngestions).values({
    id: randomUUID(),
    activity_id: input.activityId,
    profile_id: input.profileId,
    source: input.source,
    provider: input.provider ?? null,
    external_id: input.externalId ?? null,
    file_path: input.filePath,
    file_size: input.fileSize,
    file_type: input.fileType,
    status: "ready",
    attempt_count: 1,
    requested_at: input.now,
    started_at: input.now,
    completed_at: input.now,
    created_at: input.now,
    updated_at: input.now,
  });
}

export async function updateCanonicalActivityFields(
  tx: TransactionClient,
  input: {
    activityId: string;
    profileId: string;
    fields: Partial<
      Pick<typeof activities.$inferInsert, "name" | "notes" | "is_private" | "normalized_power">
    >;
    now?: Date;
  },
) {
  const [activity] = await tx
    .update(activities)
    .set({ ...input.fields, updated_at: input.now ?? new Date() })
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .returning();
  return activity;
}

/** The sole atomic writer for the canonical activity projection. */
export async function submitActivity(
  db: DbClient,
  input: ActivitySubmission | ExistingActivityEnrichmentSubmission,
) {
  const activityId =
    input.kind === "enrich" ? input.activityId : (input.requestedActivityId ?? randomUUID());
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
      const laps =
        input.laps === undefined ? undefined : activityLapRecordListSchema.parse(input.laps ?? []);
      const {
        activity_id: _activityId,
        profile_id: _profileId,
        created_at: _createdAt,
        ...summaryValues
      } = input.summaryValues;
      await tx
        .update(activities)
        .set({
          ...summaryValues,
          activity_file_path: input.activityFilePath,
          activity_file_size: input.activityFileSize,
          import_file_type: input.activityFileType,
          device_manufacturer: stringOrNull(input.deviceManufacturer),
          device_product: stringOrNull(input.deviceProduct),
          ...(input.mapBounds === undefined ? {} : { map_bounds: input.mapBounds }),
          ...(input.polyline === undefined ? {} : { polyline: input.polyline }),
          ...(laps === undefined ? {} : { laps }),
          updated_at: now,
        })
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)));
      await reconcileGeneratedActivityEvidence(tx, {
        activityId,
        profileId: input.profileId,
        efforts: input.efforts,
        detectedLTHR: input.detectedLTHR,
        activityCompletedAt: input.activityCompletedAt,
        now,
      });
      if (input.ingestion) {
        await persistReadyActivityFileIngestion(tx, {
          activityId,
          profileId: input.profileId,
          source: input.ingestion.source,
          provider: input.ingestion.provider,
          externalId: input.ingestion.externalId,
          filePath: input.activityFilePath,
          fileSize: input.activityFileSize,
          fileType: input.activityFileType,
          now,
        });
      }
      return;
    }
    const provenance = input.providerProvenance;
    const laps = activityLapRecordListSchema.parse(input.laps ?? []);
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
      pool_length: input.poolLength ?? null,
      provider: provenance?.provider,
      external_id: provenance?.externalId,
      activity_file_path: input.activityFilePath,
      activity_file_size: input.activityFileSize,
      import_source: input.importSource,
      import_file_type: input.importFileType,
      import_original_file_name: input.importOriginalFileName,
      device_manufacturer: stringOrNull(input.deviceManufacturer),
      device_product: stringOrNull(input.deviceProduct),
      map_bounds: input.mapBounds,
      polyline: input.polyline,
      laps,
      created_at: now,
      updated_at: now,
    });

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
    if (input.analysis) {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId,
        profileId: input.profileId,
        efforts: input.analysis.efforts,
        detectedLTHR: input.analysis.detectedLTHR,
        activityCompletedAt: input.analysis.activityCompletedAt,
        now,
      });
      const ingestion = input.analysis.ingestion;
      if (ingestion) {
        await persistReadyActivityFileIngestion(tx, {
          activityId,
          profileId: input.profileId,
          source: ingestion.source,
          provider: ingestion.provider,
          externalId: ingestion.externalId,
          filePath: input.activityFilePath ?? null,
          fileSize: input.activityFileSize ?? null,
          fileType: ingestion.fileType,
          now,
        });
      }
    }
    if (input.composition) {
      compositionResult = await input.composition.persist(tx, { activityId, now });
    }
  });
  return { id: activityId, compositionResult };
}
