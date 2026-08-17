import { isPlannedSessionConflict } from "@repo/api/client";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_INGESTION_STATUS_V1_FIXTURES,
  ATHLETE_CURRENT_STATE_V1_FIXTURES,
  ATHLETE_LOAD_RANGE_V1_FIXTURES,
  PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES,
  PLANNED_SESSION_RANGE_V1_FIXTURES,
  TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE,
} from "./api-client-contract-v1";

describe("web API client contract v1 fixtures", () => {
  it("exposes loading-relevant athlete, ingestion, and truncated-range states", () => {
    expect(
      ATHLETE_CURRENT_STATE_V1_FIXTURES.some((state) => state.freshness === "unavailable"),
    ).toBe(true);
    expect(
      ACTIVITY_INGESTION_STATUS_V1_FIXTURES.some(
        (status) => status.status === "failed_retryable" && status.actions.retry,
      ),
    ).toBe(true);
    expect(PLANNED_SESSION_RANGE_V1_FIXTURES.some((range) => range.truncated)).toBe(true);
    expect(
      ATHLETE_LOAD_RANGE_V1_FIXTURES.some((range) =>
        range.days.some((day) => day.coverage.status === "partial"),
      ),
    ).toBe(true);
    expect(TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.firstPage.hasMore).toBe(true);
    expect(TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE.continuationPage.hasMore).toBe(false);
    expect(PLANNED_SESSION_MUTATION_RECEIPT_V1_FIXTURES.map((receipt) => receipt.outcome)).toEqual([
      "created",
      "unchanged",
      "updated",
    ]);
    expect(isPlannedSessionConflict({ data: { code: "CONFLICT" } })).toBe(true);
    expect(
      ACTIVITY_INGESTION_STATUS_V1_FIXTURES.filter(
        (status) => status.status === "succeeded" || status.status === "failed_terminal",
      ),
    ).toHaveLength(2);
  });
});
