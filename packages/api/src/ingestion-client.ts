import type { z } from "zod";
import type { activityIngestionSafeStatusDtoSchema } from "./contracts/activity-ingestion";

export type ActivityIngestionClientStatus = z.infer<typeof activityIngestionSafeStatusDtoSchema>;

export function ingestionStatusPollingInterval(status: ActivityIngestionClientStatus | undefined) {
  return status?.status === "awaiting_upload" || status?.status === "processing" ? 2_000 : false;
}

/** Provider retries stay service-owned; only direct retryable intake may expose an app retry. */
export function canRetryDirectIngestion(status: ActivityIngestionClientStatus | undefined) {
  return (
    status?.status === "failed_retryable" &&
    status.actions.retry &&
    status.source !== "provider_sync"
  );
}
