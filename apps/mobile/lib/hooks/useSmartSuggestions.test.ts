import { describe, expect, it } from "vitest";
import { deriveSmartSuggestion } from "./useSmartSuggestions";

const plan = {
  created_at: "2026-01-01T00:00:00.000Z",
  structure: {},
};

describe("deriveSmartSuggestion", () => {
  it("derives low adherence from available plan-alignment session totals", () => {
    const suggestion = deriveSmartSuggestion({
      plan,
      status: {},
      weeklySummaries: [
        { planAlignment: { status: "available", completedSessions: 0, totalSessions: 2 } },
        { planAlignment: { status: "available", completedSessions: 1, totalSessions: 4 } },
      ],
    });

    expect(suggestion).toMatchObject({
      reason: "low_adherence",
      description: expect.stringContaining("13%"),
    });
  });

  it("does not infer adherence when plan alignment is unavailable", () => {
    expect(
      deriveSmartSuggestion({
        plan,
        status: {},
        weeklySummaries: [
          { planAlignment: { status: "unavailable", completedSessions: 0, totalSessions: 2 } },
          { planAlignment: { status: "unavailable", completedSessions: 0, totalSessions: 2 } },
        ],
      }),
    ).toBeNull();
  });
});
