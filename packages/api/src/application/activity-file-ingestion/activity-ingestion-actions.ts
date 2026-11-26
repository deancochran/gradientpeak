import {
  type ActivityIngestionSafeStatusDto,
  activityIngestionSafeStatusDtoSchema,
} from "../../contracts/activity-ingestion";
import type { DrizzleQueryExecutor } from "../../db";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";
import type { ActivityIngestionSafeStatus } from "../../repositories/activity-ingestion-repository-port";

export class ActivityIngestionNotFoundError extends Error {}

export function toActivityIngestionSafeStatusDto(
  status: ActivityIngestionSafeStatus,
): ActivityIngestionSafeStatusDto {
  const base = {
    ingestionId: status.id,
    profileId: status.profileId,
    operationId: status.operationId,
    source: status.source,
    activityId: status.activityId,
    artifactId: status.artifactId,
    requestedAt: status.requestedAt,
    updatedAt: status.updatedAt,
  };
  switch (status.status) {
    case "awaiting_upload":
    case "processing":
      return activityIngestionSafeStatusDtoSchema.parse({
        ...base,
        status: status.status,
        startedAt: status.startedAt,
        actions: { retry: false },
      });
    case "failed_retryable":
      return activityIngestionSafeStatusDtoSchema.parse({
        ...base,
        status: status.status,
        failureCode: status.failureCode,
        failedAt: status.failedAt,
        actions: { retry: true },
      });
    case "succeeded":
      return activityIngestionSafeStatusDtoSchema.parse({
        ...base,
        status: status.status,
        activityId: status.activityId,
        artifactId: status.artifactId,
        completedAt: status.completedAt,
        actions: { retry: false },
      });
    case "failed_terminal":
      return activityIngestionSafeStatusDtoSchema.parse({
        ...base,
        status: status.status,
        failureCode: status.failureCode,
        failedAt: status.failedAt,
        actions: { retry: false },
      });
  }
}

export async function readActivityIngestionSafeStatus(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  ingestionId: string;
}) {
  const status = await createDrizzleActivityIngestionRepository(input.db).readSafeStatus(input);
  if (!status) throw new ActivityIngestionNotFoundError("Activity ingestion not found");
  return toActivityIngestionSafeStatusDto(status);
}
