import type { ActivityFileType } from "@repo/core/server/activity-files";
import type { activities, activityEfforts } from "@repo/db";
import type { getRequiredDb } from "../../db";
import { submitActivity } from "../activities/submit-activity";

type DbClient = ReturnType<typeof getRequiredDb>;

interface ParsedActivityFilePersistenceData {
  metadata: {
    type: string;
    startTime: Date;
    manufacturer?: unknown;
    product?: unknown;
  } & Record<string, unknown>;
  laps?: unknown[] | null;
}

interface ExistingActivityFileEnrichmentPersistenceData {
  activityCompletedAt: Date;
  activityCompletedAtIso: string;
  detectedLTHR: number | null;
  effortsToInsert: Array<typeof activityEfforts.$inferInsert>;
  geometry: {
    mapBounds: (typeof activities.$inferInsert)["map_bounds"];
    polyline: (typeof activities.$inferInsert)["polyline"];
  };
  replaceGeometry?: boolean;
  summaryValues: Partial<typeof activities.$inferInsert> & {
    activity_id?: string;
    profile_id?: string;
  };
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

export async function persistExistingActivityFileEnrichment(
  db: DbClient,
  input: PersistExistingActivityFileEnrichmentInput,
) {
  const { enrichment } = input;
  const replaceGeometry =
    enrichment.replaceGeometry ??
    (enrichment.geometry.mapBounds != null || enrichment.geometry.polyline != null);
  await submitActivity(db, {
    kind: "enrich",
    activityId: input.activityId,
    profileId: input.profileId,
    activityFilePath: input.activityFilePath,
    activityFileSize: input.activityFileSize,
    activityFileType: input.activityFileType,
    deviceManufacturer: input.parsedData.metadata.manufacturer,
    deviceProduct: input.parsedData.metadata.product,
    laps: input.parsedData.laps,
    mapBounds: replaceGeometry ? enrichment.geometry.mapBounds : undefined,
    polyline: replaceGeometry ? enrichment.geometry.polyline : undefined,
    summaryValues: enrichment.summaryValues,
    efforts: enrichment.effortsToInsert,
    detectedLTHR: enrichment.detectedLTHR,
    activityCompletedAt: enrichment.activityCompletedAt,
    activityType: input.parsedData.metadata.type,
    startedAt: input.parsedData.metadata.startTime,
    finishedAt: enrichment.activityCompletedAt,
  });
}
