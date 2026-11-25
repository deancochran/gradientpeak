import { describe, expect, it } from "vitest";
import {
  describePlannedSessionOutcome,
  getCalendarStatusLabel,
  getPlannedSessionOutcomeLabel,
} from "./planned-session-outcome";

describe("planned session outcome presentation", () => {
  it("distinguishes skipped and partial sessions from completed sessions", () => {
    const skipped = {
      status: "completed" as const,
      completion: {
        state: "skipped" as const,
        skippedAt: "2026-11-16T12:00:00.000Z",
        operationId: "00000000-0000-4000-8000-000000000001",
      },
    };
    const partial = {
      status: "completed" as const,
      completion: {
        state: "linked" as const,
        activityId: "00000000-0000-4000-8000-000000000002",
        linkedAt: "2026-11-16T12:00:00.000Z",
        outcome: "partial" as const,
      },
    };

    expect(getPlannedSessionOutcomeLabel(skipped)).toBe("Skipped");
    expect(describePlannedSessionOutcome(skipped)).toBe("This session was skipped.");
    expect(getPlannedSessionOutcomeLabel(partial)).toBe("Partially completed");
    expect(describePlannedSessionOutcome(partial)).toBe("This session was partially completed.");
  });

  it("preserves full and legacy linked completions while retaining safe fallbacks", () => {
    const legacyLinked = {
      status: "completed" as const,
      completion: {
        state: "linked" as const,
        activityId: "00000000-0000-4000-8000-000000000003",
        linkedAt: "2026-11-16T12:00:00.000Z",
      },
    };

    expect(getPlannedSessionOutcomeLabel(legacyLinked)).toBe("Completed");
    expect(getCalendarStatusLabel("scheduled")).toBe("Scheduled");
    expect(getCalendarStatusLabel("cancelled")).toBe("Cancelled");
    expect(getCalendarStatusLabel("expired")).toBe("Unverified");
  });
});
