import type { DrizzleDbClient } from "@repo/db";

export type ProviderSyncJobStatus = "queued" | "running" | "completed" | "failed" | "dead_lettered";

export type ProviderSyncJobRecord = {
  attempt: number;
  dedupeKey: string | null;
  id: string;
  integrationId: string;
  internalResourceId: string | null;
  jobType: string;
  maxAttempts: number;
  payload: unknown;
  profileId: string;
  provider: "wahoo" | "strava" | "trainingpeaks" | "garmin" | "zwift";
  resourceKind: "event" | "activity_plan" | "activity_route" | "activity" | null;
  runAt: string;
  status: ProviderSyncJobStatus;
};

export type ProviderWebhookReceiptRecord = {
  createdAt?: string | null;
  eventType: string;
  id: string;
  integrationId: string | null;
  jobId?: string | null;
  lastError?: string | null;
  payload: unknown;
  processingStatus?: string;
  provider: "wahoo" | "strava" | "trainingpeaks" | "garmin" | "zwift";
  providerAccountId: string | null;
  providerEventId: string | null;
  receivedAt?: string | null;
};

export interface ProviderSyncRepository {
  claimDueJobs(input: {
    jobTypes?: string[];
    limit: number;
    now: string;
    workerId: string;
    lockExpiresAt: string;
    provider?: "wahoo";
  }): Promise<ProviderSyncJobRecord[]>;
  enqueueJob(input: {
    dedupeKey?: string;
    integrationId: string;
    internalResourceId?: string;
    jobType: string;
    maxAttempts?: number;
    payload: unknown;
    profileId: string;
    provider: "wahoo";
    resourceKind?: "event" | "activity_plan" | "activity_route" | "activity";
    runAt: string;
  }): Promise<{ id: string; status: ProviderSyncJobStatus }>;
  markJobFailed(input: {
    id: string;
    lastError: string;
    nextRunAt?: string;
    status: Extract<ProviderSyncJobStatus, "queued" | "failed" | "dead_lettered">;
  }): Promise<void>;
  markJobSucceeded(id: string): Promise<void>;
  markWebhookReceiptProcessed(input: {
    id: string;
    lastError?: string;
    status: "failed" | "processed";
  }): Promise<void>;
  storeWebhookReceipt(input: {
    eventType: string;
    integrationId?: string;
    objectId?: string;
    objectType?: string;
    payload: unknown;
    payloadHash?: string;
    provider: "wahoo";
    providerAccountId?: string;
    providerEventId?: string;
  }): Promise<{ id: string; inserted: boolean }>;
  setWebhookReceiptJob(input: { id: string; jobId: string }): Promise<void>;
  getWebhookReceipt(id: string): Promise<ProviderWebhookReceiptRecord | null>;
  listJobs(input: {
    limit: number;
    provider?: "wahoo" | "garmin";
    statuses?: ProviderSyncJobStatus[];
  }): Promise<ProviderSyncJobRecord[]>;
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
    integrationId: string;
    nextSyncAt?: string;
    provider: "wahoo";
    resource: string;
    succeeded: boolean;
  }): Promise<void>;
}

export interface CreateProviderSyncRepositoryOptions {
  db: DrizzleDbClient;
}
