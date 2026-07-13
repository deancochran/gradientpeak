import { describe, expect, it, vi } from "vitest";
import { loadOwnedActivityPlansForScheduleGap } from "./scheduleGapActivityPlanMatches";

describe("schedule-gap activity plan loading", () => {
  it("loads canonical plans without direct estimation-cache SQL", async () => {
    const execute = vi.fn(async (_query: unknown) => ({
      rows: [{ id: "plan-1", profile_id: "profile-1" }],
    }));
    const result = await loadOwnedActivityPlansForScheduleGap({
      db: { execute } as any,
      profileId: "profile-1",
    });

    expect(result).toEqual([{ id: "plan-1", profile_id: "profile-1" }]);
    const sqlTree = JSON.stringify(execute.mock.calls[0]?.[0]);
    expect(sqlTree).toContain("activity_plans");
    expect(sqlTree).not.toContain("activity_plan_derived_metrics_cache");
  });
});
