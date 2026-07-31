import { describe, expect, it } from "vitest";

import {
  assertOnlineRecordingSubmission,
  isReviewFrozen,
  submissionRecoveryLabel,
} from "./session";

describe("recording submission recovery copy", () => {
  it("states that the activity is saved while Session RPE can be retried", () => {
    expect(
      submissionRecoveryLabel({
        status: "retry_wait",
        activityId: "activity-1",
        lastError: "session_rpe_pending",
      }),
    ).toBe("Activity saved; Session RPE is pending");
  });

  it("freezes local review fields after an activity is durably created", () => {
    expect(isReviewFrozen(null)).toBe(false);
    expect(
      isReviewFrozen({
        activityId: "activity-1",
      }),
    ).toBe(true);
  });

  it("fails fast while offline so the durable queue can schedule a retry", () => {
    expect(() => assertOnlineRecordingSubmission(false)).toThrow(TypeError);
    expect(() => assertOnlineRecordingSubmission(true)).not.toThrow();
  });
});
