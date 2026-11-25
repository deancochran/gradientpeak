import { describe, expect, it } from "vitest";

import { readDailyTrainingLoadRangeRequestSchema } from "./athlete-derived-state";
import { plannedSessionMutationSchema } from "./planned-sessions";

const profileId = "11111111-1111-4111-8111-111111111111";

describe("prepared API DTOs", () => {
  it("reuses the bounded PlanningRange contract for derived load reads", () => {
    expect(
      readDailyTrainingLoadRangeRequestSchema.safeParse({
        profileId,
        range: { startDate: "2026-01-01", endDate: "2027-01-01" },
      }).success,
    ).toBe(true);
    expect(
      readDailyTrainingLoadRangeRequestSchema.safeParse({
        profileId,
        range: { startDate: "2026-01-01", endDate: "2027-01-02" },
      }).success,
    ).toBe(false);
  });

  it("rejects extra transport fields on planned-session writes", () => {
    const mutation = {
      action: "move",
      profileId,
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 3,
      planningDate: "2026-08-12",
    };
    expect(plannedSessionMutationSchema.safeParse(mutation).success).toBe(true);
    expect(plannedSessionMutationSchema.safeParse({ ...mutation, table: "events" }).success).toBe(
      false,
    );
  });
});
