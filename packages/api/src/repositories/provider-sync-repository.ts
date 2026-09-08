import type { PersistentIntegrationSourceId, ProviderDisconnectOutcome } from "@repo/core";
import type { DrizzleTransactionClient } from "../db";

export type ProviderSyncJobStatus = "queued" | "running" | "completed" | "failed" | "dead_lettered";

export type EnqueueProviderSyncJobInput<TProvider extends string = PersistentIntegrationSourceId> =
  {
    dedupeKey?: string;
    integrationId: string;
    integrationGeneration?: number;
    importRunId?: string;
    internalResourceId?: string;
    jobType: string;
    maxAttempts?: number;
    operation?: string;
    payload: unknown;
    payloadHash?: string;
    priority?: number;
    profileId: string;
    provider: TProvider;
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

export interface ProviderSyncJobQueue<
  TProvider extends string = PersistentIntegrationSourceId,
  TStatus extends string = ProviderSyncJobStatus,
> {
  enqueueJob(
    input: EnqueueProviderSyncJobInput<TProvider>,
  ): Promise<{ id: string; status: TStatus }>;
  enqueueJobInTransaction(
    tx: DrizzleTransactionClient,
    input: EnqueueProviderSyncJobInput<TProvider>,
  ): Promise<{ id: string; status: TStatus }>;
}

/** Shared stale-work fence used before credentials, provider I/O, or local finalization. */
export interface ProviderIntegrationGenerationFenceRepository {
  isIntegrationGenerationActive?(input: {
    generation: number;
    integrationId: string;
    profileId: string;
  }): Promise<boolean>;
}

export type ProviderDisconnectAttemptResult =
  | { accessToken: string; disposition: "ready" }
  | { disposition: "invalid" }
  | { disposition: "superseded" };

/** Persistence lifecycle only; remote revocation remains an adapter-owned protocol operation. */
export interface ProviderDisconnectLifecycleRepository<TProvider extends string> {
  requestProviderDisconnect(input: { profileId: string; provider: TProvider }): Promise<{
    generation: number | null;
    integrationId: string | null;
    jobId: string | null;
    status: "disconnected" | "pending" | "not_found";
  }>;
  beginProviderDisconnectAttempt(input: {
    generation: number;
    integrationId: string;
    jobId: string;
    provider: TProvider;
    workerId: string;
  }): Promise<ProviderDisconnectAttemptResult | null>;
  finalizeProviderDisconnect(input: {
    generation: number;
    integrationId: string;
    jobId: string;
    outcome: ProviderDisconnectOutcome;
    provider: TProvider;
    workerId: string;
  }): Promise<boolean>;
}

/** Local cleanup after the provider has already revoked authorization and notified the app. */
export interface ProviderDeauthorizationLifecycleRepository<TProvider extends string> {
  applyProviderDeauthorization(input: {
    expectedIntegrationGeneration: number;
    integrationId: string;
    jobId: string;
    ownerExternalId: string;
    profileId: string;
    provider: TProvider;
    receiptId: string;
    workerId: string;
  }): Promise<boolean>;
}
