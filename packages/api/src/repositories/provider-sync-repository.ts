import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../db";

export type ProviderSyncJobStatus = "queued" | "running" | "completed" | "failed" | "dead_lettered";

export type EnqueueProviderSyncJobInput = {
  dedupeKey?: string;
  integrationId: string;
  integrationGeneration?: number;
  internalResourceId?: string;
  jobType: string;
  maxAttempts?: number;
  operation?: string;
  payload: unknown;
  payloadHash?: string;
  priority?: number;
  profileId: string;
  provider: "wahoo";
  resourceKind?:
    | "event"
    | "activity_plan"
    | "activity_route"
    | "group_event_route_delivery"
    | "activity";
  runAt: string;
  supersedesJobId?: string;
  syncLaneKey?: string;
};

export type ProviderSyncJobRecord = {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationId: string;
  integrationGeneration?: number;
  internalResourceId: string | null;
  jobType: string;
  lastError: string | null;
  maxAttempts: number;
  operation: string | null;
  payload: unknown;
  payloadHash: string | null;
  profileId: string;
  provider: "wahoo" | "strava" | "trainingpeaks" | "garmin" | "zwift";
  queueSequence?: number;
  resourceKind:
    | "event"
    | "activity_plan"
    | "activity_route"
    | "group_event_route_delivery"
    | "activity"
    | null;
  runAt: string;
  staleLockRecovered?: boolean;
  status: ProviderSyncJobStatus;
  supersedesJobId: string | null;
  syncLaneKey: string | null;
  updatedAt?: string;
};

export type ProviderSyncStateRecord = {
  consecutiveFailures: number;
  cursor: string | null;
  highWatermark: string | null;
  id: string;
  integrationId: string;
  lastError: string | null;
  lastSyncFailedAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncSucceededAt: string | null;
  metadata: unknown;
  nextSyncAt: string | null;
  provider: "wahoo" | "strava" | "trainingpeaks" | "garmin" | "zwift";
  publishHorizonDays: number | null;
  resource: string;
  syncMode: string;
};

export type ProviderWebhookReceiptRecord = {
  createdAt?: string | null;
  eventType: string;
  id: string;
  integrationId: string | null;
  integrationGeneration?: number | null;
  jobId?: string | null;
  lastError?: string | null;
  payload: unknown;
  processingStatus?: string;
  provider: "wahoo" | "strava" | "trainingpeaks" | "garmin" | "zwift";
  providerAccountId: string | null;
  providerEventId: string | null;
  receivedAt?: string | null;
};

export type WahooDisconnectAttemptResult =
  | { accessToken: string; disposition: "ready" }
  | { disposition: "invalid" }
  | { disposition: "superseded" };

export interface ProviderSyncRepository {
  failJobWithSyncState(input: {
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    lastError: string;
    nextRunAt?: string;
    provider: "wahoo";
    resource: string;
    status: Extract<ProviderSyncJobStatus, "failed" | "dead_lettered">;
    workerId: string;
  }): Promise<boolean>;
  completeJobWithSyncState(input: {
    expectedIntegrationGeneration?: number;
    highWatermark: string;
    id: string;
    integrationId: string;
    metadata: Record<string, unknown>;
    provider: "wahoo";
    resource: string;
    workerId: string;
  }): Promise<boolean>;
  updateRunningJobDesiredState(input: {
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    payload: unknown;
    payloadHash: string;
    profileId: string;
    provider: "wahoo";
    workerId: string;
  }): Promise<boolean>;
  getQueueTelemetry?(input: {
    jobTypes?: string[];
    now: string;
    provider?: "wahoo";
  }): Promise<{ deadLetterDepth: number; oldestDueAt: string | null; queueDepth: number }>;
  claimDueJobs(input: {
    jobTypes?: string[];
    limit: number;
    now: string;
    workerId: string;
    lockExpiresAt: string;
    provider?: "wahoo";
  }): Promise<ProviderSyncJobRecord[]>;
  enqueueJob(
    input: EnqueueProviderSyncJobInput,
  ): Promise<{ id: string; status: ProviderSyncJobStatus }>;
  enqueueJobInTransaction(
    tx: DrizzleTransactionClient,
    input: EnqueueProviderSyncJobInput,
  ): Promise<{ id: string; status: ProviderSyncJobStatus }>;
  markJobFailed(input: {
    expectedIntegrationGeneration?: number;
    id: string;
    lastError: string;
    nextRunAt?: string;
    status: Extract<ProviderSyncJobStatus, "queued" | "failed" | "dead_lettered">;
    workerId: string;
  }): Promise<boolean>;
  isIntegrationGenerationActive?(input: {
    generation: number;
    integrationId: string;
    profileId: string;
  }): Promise<boolean>;
  requestWahooDisconnect(input: { profileId: string }): Promise<{
    generation: number | null;
    integrationId: string | null;
    jobId: string | null;
    status: "disconnected" | "pending" | "not_found";
  }>;
  beginWahooDisconnectAttempt(input: {
    generation: number;
    integrationId: string;
    jobId: string;
    workerId: string;
  }): Promise<WahooDisconnectAttemptResult | null>;
  finalizeWahooDisconnect(input: {
    generation: number;
    integrationId: string;
    jobId: string;
    outcome: "confirmed" | "retry" | "dead_lettered";
    workerId: string;
  }): Promise<boolean>;
  markJobSucceeded(
    id: string,
    workerId: string,
    expectedIntegrationGeneration?: number,
  ): Promise<boolean>;
  renewJobLease(input: { id: string; lockExpiresAt: string; workerId: string }): Promise<boolean>;
  finalizeWebhookReceiptJob(input: {
    jobId: string;
    jobStatus: Extract<ProviderSyncJobStatus, "completed" | "failed" | "dead_lettered">;
    lastError?: string;
    nextRunAt?: string;
    receiptId: string;
    receiptStatus: "failed" | "processed";
    workerId: string;
  }): Promise<boolean>;
  markWebhookReceiptProcessed(input: {
    id: string;
    lastError?: string;
    status: "failed" | "processed";
  }): Promise<void>;
  storeWebhookReceipt(input: {
    eventType: string;
    integrationId?: string;
    integrationGeneration?: number;
    objectId?: string;
    objectType?: string;
    payload: unknown;
    payloadHash?: string;
    provider: "wahoo";
    providerAccountId?: string;
    providerEventId?: string;
  }): Promise<{ id: string; inserted: boolean; captured: boolean }>;
  setWebhookReceiptJob(input: { id: string; jobId: string }): Promise<void>;
  getWebhookReceipt(id: string): Promise<ProviderWebhookReceiptRecord | null>;
  listJobs(input: {
    internalResourceId?: string;
    limit: number;
    order?: "newest_authority" | "oldest_run_at";
    profileId?: string;
    provider?: "wahoo" | "garmin";
    statuses?: ProviderSyncJobStatus[];
  }): Promise<ProviderSyncJobRecord[]>;
  listSyncStateByIntegrationIds(integrationIds: string[]): Promise<ProviderSyncStateRecord[]>;
  listWebhookReceipts(input: {
    limit: number;
    provider?: "wahoo" | "garmin";
    statuses?: string[];
  }): Promise<ProviderWebhookReceiptRecord[]>;
  retryJob(id: string): Promise<boolean>;
  retryWebhookReceipt(id: string): Promise<boolean>;
  touchSyncState(input: {
    integrationId: string;
    metadata?: Record<string, unknown>;
    nextSyncAt?: string;
    provider: "wahoo";
    publishHorizonDays?: number;
    resource: string;
    syncMode: string;
  }): Promise<void>;
  updateSyncStateAfterFailure(input: {
    integrationId: string;
    lastError: string;
    nextSyncAt?: string;
    provider: "wahoo";
    resource: string;
  }): Promise<void>;
  updateSyncStateAfterRun(input: {
    highWatermark?: string;
    integrationId: string;
    metadata?: Record<string, unknown>;
    nextSyncAt?: string;
    provider: "wahoo";
    resource: string;
    succeeded: boolean;
  }): Promise<void>;
}

export interface CreateProviderSyncRepositoryOptions {
  db: DrizzleDbClient;
}
