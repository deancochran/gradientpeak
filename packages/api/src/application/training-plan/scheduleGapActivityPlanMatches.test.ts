import { describe, expect, it, vi } from "vitest";
import {
  buildScheduleGapActivityPlanMatches,
  loadOwnedActivityPlansForScheduleGap,
} from "./scheduleGapActivityPlanMatches";

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

  it("does not resurrect stale top-level TSS after an authoritative null", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetTssDelta: 70,
      primaryCategory: "bike",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Stale plan",
          activity_category: "bike",
          estimated_tss: 70,
          authoritative_metrics: { estimated_tss: null },
        },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.empty_reason).toBe("no_estimated_tss");
  });

  it("distinguishes unsuitable matches from plans without estimated TSS", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetTssDelta: 70,
      primaryCategory: "run",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Bike plan",
          activity_category: "bike",
          authoritative_metrics: { estimated_tss: 70 },
        },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.empty_reason).toBe("low_confidence");
  });
});
