import type { ActivityFileIngestionOperation } from "@repo/core/activity-files";

export type ActivityIngestionOperationWriteResult =
  | { status: "created"; operation: ActivityFileIngestionOperation }
  | { status: "unchanged"; operation: ActivityFileIngestionOperation }
  | { status: "identity_conflict" };

export type ActivityIngestionOperationMutationResult =
  | { status: "updated"; operation: ActivityFileIngestionOperation }
  | { status: "not_found" }
  | { status: "state_conflict"; operation: ActivityFileIngestionOperation };

export type ActivityIngestionOperationLifecycleUpdate =
  | { status: "processing"; startedAt: string }
  | {
      status: "failed_retryable";
      failureCode: NonNullable<ActivityFileIngestionOperation["failureCode"]>;
      failedAt: string;
    }
  | {
      status: "failed_terminal";
      failureCode: NonNullable<ActivityFileIngestionOperation["failureCode"]>;
      failedAt: string;
    };

export type ActivityIngestionSafeStatus = Pick<
  ActivityFileIngestionOperation,
  | "id"
  | "profileId"
  | "operationId"
  | "source"
  | "activityId"
  | "artifactId"
  | "status"
  | "failureCode"
  | "requestedAt"
  | "startedAt"
  | "completedAt"
  | "failedAt"
  | "updatedAt"
>;

/** Owner-scoped persistence for the direct, idempotent ingestion operation. */
export interface ActivityIngestionRepositoryPort {
  createOrLoad(
    operation: ActivityFileIngestionOperation,
  ): Promise<ActivityIngestionOperationWriteResult>;
  getOwned(input: {
    profileId: string;
    ingestionId: string;
  }): Promise<ActivityFileIngestionOperation | null>;
  getOwnedByOperation(input: {
    profileId: string;
    operationId: string;
  }): Promise<ActivityFileIngestionOperation | null>;
  recordStagingExpectations(input: {
    profileId: string;
    ingestionId: string;
    stagingBucket: string;
    stagingPath: string;
    expectedSha256: string;
    expectedByteSize: number;
    expectedFormat: "fit" | "gpx" | "tcx";
    expectedMediaType:
      | "application/vnd.ant.fit"
      | "application/gpx+xml"
      | "application/vnd.garmin.tcx+xml";
    uploadedAt: string;
  }): Promise<ActivityIngestionOperationMutationResult>;
  replaceProviderRetryStaging(input: {
    profileId: string;
    ingestionId: string;
    provider: NonNullable<ActivityFileIngestionOperation["provider"]>;
    externalId: string;
    integrationId: string;
    stagingBucket: string;
    stagingPath: string;
    expectedSha256: string;
    expectedByteSize: number;
    expectedFormat: "fit" | "gpx" | "tcx";
    expectedMediaType:
      | "application/vnd.ant.fit"
      | "application/gpx+xml"
      | "application/vnd.garmin.tcx+xml";
    uploadedAt: string;
  }): Promise<ActivityIngestionOperationMutationResult>;
  resetRetryableFailureForUpload(input: {
    profileId: string;
    ingestionId: string;
    operationId: string;
    source: "mobile_recording";
    resetAt: string;
  }): Promise<ActivityIngestionOperationMutationResult>;
  recordAcceptedResult(input: {
    profileId: string;
    ingestionId: string;
    operationId: string;
    source: ActivityFileIngestionOperation["source"];
    artifactId: string;
    activityId: string;
    completedAt: string;
  }): Promise<ActivityIngestionOperationMutationResult>;
  transitionLifecycle(input: {
    profileId: string;
    ingestionId: string;
    update: ActivityIngestionOperationLifecycleUpdate;
  }): Promise<ActivityIngestionOperationMutationResult>;
  updateCleanup(input: {
    profileId: string;
    ingestionId: string;
    update:
      | { status: "pending" }
      | { status: "failed"; error: string }
      | { status: "cleaned"; cleanedAt: string };
  }): Promise<ActivityIngestionOperationMutationResult>;
  readSafeStatus(input: {
    profileId: string;
    ingestionId: string;
  }): Promise<ActivityIngestionSafeStatus | null>;
  listPendingCleanup(input: {
    profileId: string;
    limit: number;
  }): Promise<ActivityFileIngestionOperation[]>;
}
