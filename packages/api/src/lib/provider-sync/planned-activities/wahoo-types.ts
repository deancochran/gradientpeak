export type WahooPlannedActivitySyncOperation = "publish" | "unsync";

export type WahooPlannedActivityQueueResult = {
  affectedCount: number;
  error?: string;
  failedCount?: number;
  jobId?: string | null;
  operation: WahooPlannedActivitySyncOperation;
  queued: boolean;
  skippedCount?: number;
  success: boolean;
};

export type WahooPlannedActivityProviderQueueResult = {
  jobId: string | null;
  queued: boolean;
  skipped?: boolean;
};

export interface WahooPlannedActivityAdapter {
  readonly provider: "wahoo";
  enqueuePublishPlannedSession(input: {
    plannedSessionId: string;
    profileId: string;
  }): Promise<WahooPlannedActivityProviderQueueResult>;
  enqueueUnsyncPlannedSession(input: {
    plannedSessionId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<WahooPlannedActivityProviderQueueResult>;
}
