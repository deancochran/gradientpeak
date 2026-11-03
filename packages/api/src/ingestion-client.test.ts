import { describe, expect, it } from "vitest";
import { ACTIVITY_INGESTION_STATUS_V1_FIXTURES } from "./contracts/client-contract-fixtures";
import { canRetryDirectIngestion, ingestionStatusPollingInterval } from "./ingestion-client";

describe("ingestion client policy", () => {
  it("polls only active statuses and stops for every terminal status", () => {
    for (const status of ACTIVITY_INGESTION_STATUS_V1_FIXTURES) {
      expect(ingestionStatusPollingInterval(status)).toBe(
        status.status === "awaiting_upload" || status.status === "processing" ? 2_000 : false,
      );
    }
  });

  it("does not expose provider retry as a direct client action", () => {
    const providerFailure = ACTIVITY_INGESTION_STATUS_V1_FIXTURES.find(
      (status) => status.source === "provider_sync" && status.status === "failed_retryable",
    );
    expect(canRetryDirectIngestion(providerFailure)).toBe(false);
  });
});
