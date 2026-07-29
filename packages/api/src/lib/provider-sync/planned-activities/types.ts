import type { IntegrationProviderId } from "@repo/core";

export type PlannedActivitySyncOperation = "publish" | "unsync";

export type PlannedActivityQueueResult = {
  affectedCount: number;
  error?: string;
  failedCount?: number;
  jobId?: string | null;
  operation: PlannedActivitySyncOperation;
  queued: boolean;
  skippedCount?: number;
  success: boolean;
};

export type PlannedActivityProviderQueueResult = {
  jobId: string | null;
  queued: boolean;
  skipped?: boolean;
};

export interface PlannedActivityProviderAdapter {
  provider: IntegrationProviderId;
  enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedActivityProviderQueueResult>;
  enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<PlannedActivityProviderQueueResult>;
}
