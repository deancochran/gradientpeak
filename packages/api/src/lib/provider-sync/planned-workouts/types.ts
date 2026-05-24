import type { IntegrationProviderId } from "@repo/core";

export type PlannedWorkoutSyncOperation = "publish" | "unsync";

export type PlannedWorkoutQueueResult = {
  affectedCount: number;
  error?: string;
  failedCount?: number;
  jobId?: string | null;
  operation: PlannedWorkoutSyncOperation;
  queued: boolean;
  skippedCount?: number;
  success: boolean;
};

export type PlannedWorkoutProviderQueueResult = {
  jobId: string | null;
  queued: boolean;
};

export interface PlannedWorkoutProviderAdapter {
  provider: IntegrationProviderId;
  enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedWorkoutProviderQueueResult>;
  enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedWorkoutProviderQueueResult>;
}
