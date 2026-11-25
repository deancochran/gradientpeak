import type {
  ActivityFileIngestionOperation,
  ActivityFileIngestionSource,
} from "@repo/core/activity-files";
import type { ActivityArtifactSubmission } from "../application/activities/submit-activity";
import {
  activityIngestionOperationId,
  beginActivityIngestionOperation,
  claimActivityIngestionProcessing,
} from "../application/activity-file-ingestion/direct-activity-ingestion";
import type { DrizzleQueryExecutor } from "../db";

/** Seeds the durable operation that a live-DB activity submission completes. */
export async function readyActivityIngestion(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    operationId: string;
    source: ActivityFileIngestionSource;
    artifact: ActivityArtifactSubmission;
    provider?: "strava" | "wahoo" | "trainingpeaks" | "garmin" | "zwift";
    externalId?: string;
    integrationId?: string;
  },
) {
  const operationId = activityIngestionOperationId(input.operationId);
  const operation = await beginActivityIngestionOperation(db, {
    profileId: input.profileId,
    operationId,
    source: input.source,
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
    ...(input.integrationId !== undefined ? { integrationId: input.integrationId } : {}),
    stagingBucket: input.artifact.bucket,
    stagingPath: `live-db-ingestions/${input.profileId}/${operationId}.fit`,
    expectedSha256: input.artifact.sha256,
    expectedByteSize: input.artifact.byteSize,
    expectedFormat: input.artifact.format,
    expectedMediaType: input.artifact.mediaType as NonNullable<
      ActivityFileIngestionOperation["expectedMediaType"]
    >,
    uploaded: true,
  });
  await claimActivityIngestionProcessing(db, {
    profileId: input.profileId,
    ingestionId: operation.id,
    operationId,
    source: input.source,
  });
  return { ingestionId: operation.id, operationId };
}
