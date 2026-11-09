import type { ProviderIntegrationLifecycleStatus } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../db";
import type {
  EnqueueProviderSyncJobInput,
  ProviderDeauthorizationLifecycleRepository,
  ProviderDisconnectAttemptResult,
  ProviderDisconnectLifecycleRepository,
  ProviderIntegrationGenerationFenceRepository,
  ProviderSyncJobQueue,
  ProviderSyncJobStatus,
} from "./provider-sync-repository";

export type StravaIntegrationRecord = {
  accessToken: string;
  credentialGeneration: number;
  expiresAt: string | null;
  externalId: string;
  id: string;
  integrationGeneration: number;
  lifecycleStatus: ProviderIntegrationLifecycleStatus;
  profileId: string;
  reconnectRequiredAt: string | null;
  refreshToken: string | null;
  scope: string | null;
};

export type StravaSyncJobRecord = {
  attempt: number;
  id: string;
  importRunId: string | null;
  integrationGeneration: number;
  integrationId: string;
  jobType: string;
  maxAttempts: number;
  payload: unknown;
  profileId: string;
  provider: "strava";
  status: ProviderSyncJobStatus;
};

export type StravaWebhookReceiptRecord = {
  eventType: string;
  id: string;
  integrationGeneration: number | null;
  integrationId: string | null;
  jobId: string | null;
  payload: unknown;
  processingStatus: string;
  providerAccountId: string | null;
  providerEventId: string | null;
};

export type StravaCompletedActivityUploadArtifact = {
  artifactId: string;
  bucket: string;
  byteSize: number;
  digest: string;
  format: "fit" | "gpx" | "tcx";
  mediaType: string;
  path: string;
  segmentsRevision: number;
};

export type StravaCompletedActivityUploadTarget =
  | { status: "activity_not_found" }
  | { status: "not_connected" }
  | { status: "reconnect_required" }
  | { status: "unsupported_evidence" }
  | {
      artifact: StravaCompletedActivityUploadArtifact;
      integrationGeneration: number;
      integrationId: string;
      status: "ready";
    };

export type StravaCompletedActivityUploadState =
  | {
      jobId: null;
      status:
        | "activity_not_found"
        | "not_connected"
        | "reconnect_required"
        | "unsupported_evidence"
        | "ready";
    }
  | { jobId: string; status: "queued" | "running" | "completed" | "dispatch_uncertain" | "failed" };

export type StravaCompletedActivityUploadPayload = {
  activityId: string;
  artifact: StravaCompletedActivityUploadArtifact;
  externalId: string;
} & ({ phase: "pre_dispatch" } | { phase: "dispatching" } | { phase: "polling"; uploadId: string });

export function createStravaCompletedActivityUploadDedupeKey(input: {
  activityId: string;
  artifactDigest: string;
  integrationGeneration: number;
  integrationId: string;
}): string {
  return [
    "completed-activity-upload:v1",
    "strava",
    input.integrationId,
    input.integrationGeneration,
    input.activityId,
    input.artifactDigest,
  ].join(":");
}

export interface StravaRepository
  extends ProviderSyncJobQueue<"strava">,
    ProviderIntegrationGenerationFenceRepository,
    ProviderDisconnectLifecycleRepository<"strava">,
    ProviderDeauthorizationLifecycleRepository<"strava"> {
  bindJobImportRun(input: {
    expectedIntegrationGeneration: number;
    id: string;
    importRunId: string;
    payload: unknown;
    workerId: string;
  }): Promise<boolean>;
  claimDueJobs(input: {
    jobTypes: readonly string[];
    limit: number;
    lockExpiresAt: string;
    now: string;
    workerId: string;
  }): Promise<StravaSyncJobRecord[]>;
  completeHistoryJob(input: {
    expectedIntegrationGeneration: number;
    highWatermark: string;
    id: string;
    integrationId: string;
    metadata: Record<string, unknown>;
    workerId: string;
  }): Promise<boolean>;
  completeActivityUpload(input: {
    activityId: string;
    expectedIntegrationGeneration: number;
    jobId: string;
    providerExternalId: string;
    workerId: string;
  }): Promise<boolean>;
  enqueueCompletedActivityUpload(input: {
    activityId: string;
    artifact: StravaCompletedActivityUploadArtifact;
    externalId: string;
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
  }): Promise<{ created: boolean; id: string; status: ProviderSyncJobStatus }>;
  finalizeWebhookReceiptJob(input: {
    expectedIntegrationGeneration: number;
    jobId: string;
    jobStatus: Extract<ProviderSyncJobStatus, "completed" | "failed" | "dead_lettered">;
    lastError?: string;
    nextRunAt?: string;
    receiptId: string;
    receiptStatus: "failed" | "processed";
    workerId: string;
  }): Promise<boolean>;
  failJob(input: {
    expectedIntegrationGeneration?: number;
    id: string;
    lastError: string;
    nextRunAt?: string;
    status: Extract<ProviderSyncJobStatus, "queued" | "failed" | "dead_lettered">;
    workerId: string;
  }): Promise<boolean>;
  findDirectActivitySource(input: { profileId: string; providerExternalId: string }): Promise<{
    activityId: string | null;
    providerRevision: string | null;
    resolutionStatus: string;
  } | null>;
  findCompletedActivityUploadEcho(input: {
    externalId: string;
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
  }): Promise<{ activityId: string } | null>;
  convergeCompletedActivityUploadEcho(input: {
    activityId: string;
    externalId: string;
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
    providerExternalId: string;
  }): Promise<boolean>;
  findIntegrationByExternalId(externalId: string): Promise<StravaIntegrationRecord | null>;
  findIntegrationByProfileId(profileId: string): Promise<StravaIntegrationRecord | null>;
  getWebhookReceipt(id: string): Promise<StravaWebhookReceiptRecord | null>;
  listActiveJobs(input: { profileId: string; limit?: number }): Promise<StravaSyncJobRecord[]>;
  readHistorySyncState(integrationId: string): Promise<{
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
  } | null>;
  markReconnectRequired(input: {
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    id: string;
  }): Promise<boolean>;
  runCompletedActivityUploadDispatch<T>(input: {
    expectedIntegrationGeneration: number;
    integrationId: string;
    jobId: string;
    payload: StravaCompletedActivityUploadPayload;
    workerId: string;
    profileId: string;
    dispatch: () => Promise<T>;
  }): Promise<T | null>;
  markJobSucceeded(input: {
    expectedIntegrationGeneration?: number;
    id: string;
    workerId: string;
  }): Promise<boolean>;
  renewJobLease(input: { id: string; lockExpiresAt: string; workerId: string }): Promise<boolean>;
  readCompletedActivityUploadTarget(input: {
    activityId: string;
    profileId: string;
  }): Promise<StravaCompletedActivityUploadTarget>;
  readCompletedActivityUploadState(input: {
    activityId: string;
    profileId: string;
  }): Promise<StravaCompletedActivityUploadState>;
  rescheduleActivityUpload(input: {
    expectedIntegrationGeneration: number;
    jobId: string;
    lastError?: string;
    nextRunAt: string;
    payload: StravaCompletedActivityUploadPayload;
    workerId: string;
  }): Promise<boolean>;
  storeAndEnqueueWebhookReceipt(input: {
    deliveryId: string;
    eventType: string;
    objectId: string;
    objectType: "activity" | "athlete";
    ownerExternalId: string;
    payload: unknown;
    priority: number;
  }): Promise<{ inserted: boolean; jobId: string | null; queued: boolean; receiptId: string }>;
  updateIntegrationTokens(input: {
    accessToken: string;
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    expiresAt: string;
    id: string;
    refreshToken: string;
  }): Promise<number | null>;
}

export type StravaDisconnectAttemptResult = ProviderDisconnectAttemptResult;
export type EnqueueStravaSyncJobInput = EnqueueProviderSyncJobInput<"strava">;
export interface CreateStravaRepositoryOptions {
  db: DrizzleDbClient;
}

export type EnqueueStravaJobInTransaction = (
  tx: DrizzleTransactionClient,
  input: EnqueueStravaSyncJobInput,
) => Promise<{ id: string; status: ProviderSyncJobStatus }>;
