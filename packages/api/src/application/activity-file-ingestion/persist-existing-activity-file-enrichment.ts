import type { ActivityFileType } from "@repo/core";
import type { activityEfforts, activityGeometry, activitySummaries } from "@repo/db";
import type { getRequiredDb } from "../../db";
import { markProfileAnalysisDirty } from "../../utils/profile-estimation-state";
import { submitActivity } from "../activities/submit-activity";

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

export async function persistExistingActivityFileEnrichment(
  db: DbClient,
  input: PersistExistingActivityFileEnrichmentInput,
) {
  const { enrichment } = input;
  await submitActivity(db, {
    kind: "enrich",
    activityId: input.activityId,
    profileId: input.profileId,
    activityFilePath: input.activityFilePath,
    activityFileSize: input.activityFileSize,
    activityFileType: input.activityFileType,
    deviceManufacturer: input.parsedData.metadata.manufacturer,
    deviceProduct: input.parsedData.metadata.product,
    laps: input.parsedData.laps ?? null,
    mapBounds: enrichment.geometry.mapBounds,
    polyline: enrichment.geometry.polyline,
    summaryValues: enrichment.summaryValues,
    efforts: enrichment.effortsToInsert,
    detectedLTHR: enrichment.detectedLTHR,
    activityCompletedAt: enrichment.activityCompletedAt,
    activityType: input.parsedData.metadata.type,
    startedAt: input.parsedData.metadata.startTime,
    finishedAt: enrichment.activityCompletedAt,
  });

  await markProfileAnalysisDirty(db, {
    profileId: input.profileId,
    kinds: ["fitness", "performance", "metrics"],
    dirtySince: enrichment.activityCompletedAtIso,
  });
}
