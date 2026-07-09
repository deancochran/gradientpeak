import { randomUUID } from "node:crypto";
import type { ActivityFileType } from "@repo/core";
import {
  activityEfforts,
  activityGeometry,
  activityImports,
  activityLaps,
  activitySummaries,
  profileMetrics,
} from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { markProfileAnalysisDirty } from "../../utils/profile-estimation-state";

type DbClient = ReturnType<typeof getRequiredDb>;

interface ParsedActivityFilePersistenceData {
  metadata: {
    type: string;
    startTime: Date;
    manufacturer?: unknown;
    product?: unknown;
  } & Record<string, unknown>;
  laps?: unknown[];
}

interface ExistingActivityFileEnrichmentPersistenceData {
  activityCompletedAt: Date;
  activityCompletedAtIso: string;
  detectedLTHR: number | null;
  effortsToInsert: Array<typeof activityEfforts.$inferInsert>;
  geometry: {
    mapBounds: (typeof activityGeometry.$inferInsert)["map_bounds"];
    polyline: (typeof activityGeometry.$inferInsert)["polyline"];
  };
  summaryValues: typeof activitySummaries.$inferInsert;
}

export interface PersistExistingActivityFileEnrichmentInput {
  activityId: string;
  profileId: string;
  activityFilePath: string;
  activityFileSize: number | null;
  activityFileType: ActivityFileType;
  parsedData: ParsedActivityFilePersistenceData;
  enrichment: ExistingActivityFileEnrichmentPersistenceData;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function persistExistingActivityFileEnrichment(
  db: DbClient,
  input: PersistExistingActivityFileEnrichmentInput,
) {
  const now = new Date();
  const { enrichment } = input;

  await db.transaction(async (tx) => {
    await tx
      .insert(activityImports)
      .values({
        activity_id: input.activityId,
        profile_id: input.profileId,
        activity_file_path: input.activityFilePath,
        activity_file_size: input.activityFileSize,
        import_file_type: input.activityFileType,
        device_manufacturer: toStringOrNull(input.parsedData.metadata.manufacturer),
        device_product: toStringOrNull(input.parsedData.metadata.product),
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: activityImports.activity_id,
        set: {
          activity_file_path: input.activityFilePath,
          activity_file_size: input.activityFileSize,
          import_file_type: input.activityFileType,
          device_manufacturer: toStringOrNull(input.parsedData.metadata.manufacturer),
          device_product: toStringOrNull(input.parsedData.metadata.product),
          updated_at: now,
        },
      });

    await tx
      .insert(activitySummaries)
      .values({ ...enrichment.summaryValues, created_at: now })
      .onConflictDoUpdate({
        target: activitySummaries.activity_id,
        set: enrichment.summaryValues,
      });

    if (enrichment.geometry.mapBounds || enrichment.geometry.polyline) {
      await tx
        .insert(activityGeometry)
        .values({
          activity_id: input.activityId,
          profile_id: input.profileId,
          map_bounds: enrichment.geometry.mapBounds,
          polyline: enrichment.geometry.polyline,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: activityGeometry.activity_id,
          set: {
            map_bounds: enrichment.geometry.mapBounds,
            polyline: enrichment.geometry.polyline,
            updated_at: now,
          },
        });
    }

    await tx.delete(activityLaps).where(eq(activityLaps.activity_id, input.activityId));
    if (input.parsedData.laps?.length) {
      await tx.insert(activityLaps).values(
        input.parsedData.laps.map((lap, index) => ({
          id: randomUUID(),
          activity_id: input.activityId,
          profile_id: input.profileId,
          lap_index: index,
          payload: lap,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    await tx.delete(activityEfforts).where(eq(activityEfforts.activity_id, input.activityId));
    if (enrichment.effortsToInsert.length > 0) {
      await tx.insert(activityEfforts).values(enrichment.effortsToInsert);
    }

    if (enrichment.detectedLTHR) {
      await tx.insert(profileMetrics).values({
        id: randomUUID(),
        created_at: now,
        profile_id: input.profileId,
        metric_type: "lthr",
        value: enrichment.detectedLTHR,
        unit: "bpm",
        recorded_at: enrichment.activityCompletedAt,
      });
    }
  });

  await markProfileAnalysisDirty(db, {
    profileId: input.profileId,
    kinds: ["fitness", "performance", "metrics"],
    dirtySince: enrichment.activityCompletedAtIso,
  });
}
