import { PROVIDER_DISCONNECT_POLICY } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../db";
import type {
  EnqueueProviderSyncJobInput,
  ProviderDisconnectAttemptResult,
  ProviderDisconnectLifecycleRepository,
  ProviderIntegrationGenerationFenceRepository,
  ProviderSyncJobQueue,
  ProviderSyncJobStatus,
} from "./provider-sync-repository";

/**
 * Wahoo disconnect is generation-fenced and retains GradientPeak-owned profile/activity data.
 * Enabled runtimes retain encrypted credentials until remote revocation is confirmed; disabled
 * runtimes perform an explicit local-only disconnect because no provider operation can run.
 */
export const WAHOO_DISCONNECT_POLICY = PROVIDER_DISCONNECT_POLICY;

export type WahooSyncJobStatus = ProviderSyncJobStatus;

export type EnqueueWahooSyncJobInput = EnqueueProviderSyncJobInput<"wahoo">;

export type WahooSyncJobRecord = {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationId: string;
  integrationGeneration?: number;
  importRunId?: string | null;
  internalResourceId: string | null;
  jobType: string;
  lastError: string | null;
  maxAttempts: number;
  operation: string | null;
  payload: unknown;
  payloadHash: string | null;
  profileId: string;
  provider: "wahoo";
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
  status: WahooSyncJobStatus;
  supersedesJobId: string | null;
  syncLaneKey: string | null;
  updatedAt?: string;
};

export type WahooSyncStateRecord = {
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
  provider: "wahoo";
  publishHorizonDays: number | null;
  resource: string;
  syncMode: string;
};

export type WahooWebhookReceiptRecord = {
  createdAt?: string | null;
  eventType: string;
  id: string;
  integrationId: string | null;
  integrationGeneration?: number | null;
  jobId?: string | null;
  lastError?: string | null;
  payload: unknown;
  processingStatus?: string;
  provider: "wahoo";
  providerAccountId: string | null;
  providerEventId: string | null;
  receivedAt?: string | null;
};

export type WahooDisconnectAttemptResult = ProviderDisconnectAttemptResult;

export interface WahooSyncRepository
  extends ProviderSyncJobQueue<"wahoo", WahooSyncJobStatus>,
    ProviderIntegrationGenerationFenceRepository,
    ProviderDisconnectLifecycleRepository<"wahoo"> {
  bindJobImportRun(input: {
    expectedIntegrationGeneration: number;
    id: string;
    importRunId: string;
    payload: unknown;
    workerId: string;
  }): Promise<boolean>;
  failJobWithSyncState(input: {
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    lastError: string;
    nextRunAt?: string;
    provider: "wahoo";
    resource: string;
    status: Extract<WahooSyncJobStatus, "failed" | "dead_lettered">;
    workerId: string;
  }): Promise<boolean>;
  completeJobWithSyncState(input: {
    expectedIntegrationGeneration?: number;
    highWatermark: string;
    id: string;
    integrationId: string;
    importRunId?: string;
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
  continueJob(input: {
    expectedIntegrationGeneration: number;
    id: string;
    importRunId?: string;
    payload: unknown;
    runAt: string;
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
    profileId?: string;
  }): Promise<WahooSyncJobRecord[]>;
  enqueueJob(input: EnqueueWahooSyncJobInput): Promise<{ id: string; status: WahooSyncJobStatus }>;
  enqueueJobInTransaction(
    tx: DrizzleTransactionClient,
    input: EnqueueWahooSyncJobInput,
  ): Promise<{ id: string; status: WahooSyncJobStatus }>;
  markJobFailed(input: {
    expectedIntegrationGeneration?: number;
    id: string;
    lastError: string;
    nextRunAt?: string;
    status: Extract<WahooSyncJobStatus, "queued" | "failed" | "dead_lettered">;
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
    jobStatus: Extract<WahooSyncJobStatus, "completed" | "failed" | "dead_lettered">;
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
  getWebhookReceipt(id: string): Promise<WahooWebhookReceiptRecord | null>;
  listJobs(input: {
    internalResourceId?: string;
    limit: number;
    order?: "newest_authority" | "oldest_run_at";
    profileId?: string;
    provider?: "wahoo";
    statuses?: WahooSyncJobStatus[];
  }): Promise<WahooSyncJobRecord[]>;
  listSyncStateByIntegrationIds(integrationIds: string[]): Promise<WahooSyncStateRecord[]>;
  listWebhookReceipts(input: {
    limit: number;
    provider?: "wahoo";
    statuses?: string[];
  }): Promise<WahooWebhookReceiptRecord[]>;
  retryJob(input: { id: string; provider: "wahoo" }): Promise<boolean>;
  retryWebhookReceipt(input: { id: string; provider: "wahoo" }): Promise<boolean>;
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

export interface CreateWahooSyncRepositoryOptions {
  db: DrizzleDbClient;
}
