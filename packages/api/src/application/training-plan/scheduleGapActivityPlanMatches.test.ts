import { compileActivityPlanV3, SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildScheduleGapActivityPlanMatches,
  loadOwnedActivityPlansForScheduleGap,
} from "./scheduleGapActivityPlanMatches";

function structureForActivityCategory(activity_category: "run" | "bike") {
  const template = SYSTEM_TEMPLATES.find(
    (candidate) =>
      compileActivityPlanV3(candidate.structure).activity_category === activity_category,
  );
  if (!template) throw new Error(`Missing ${activity_category} system template`);
  return template.structure;
}

describe("schedule-gap activity plan loading", () => {
  it("loads canonical plans without direct estimation-cache SQL", async () => {
    const execute = vi.fn(async (_query: unknown) => ({
      rows: [
        { id: "plan-1", profile_id: "profile-1", structure: structureForActivityCategory("run") },
      ],
    }));
    const result = await loadOwnedActivityPlansForScheduleGap({
      db: { execute } as any,
      profileId: "profile-1",
    });

    expect(result).toEqual([
      { id: "plan-1", profile_id: "profile-1", structure: structureForActivityCategory("run") },
    ]);
    const sqlTree = JSON.stringify(execute.mock.calls[0]?.[0]);
    expect(sqlTree).toContain("activity_plans");
    expect(sqlTree).not.toContain("activity_plan_derived_metrics_cache");
  });

  it("does not match a plan with unavailable authoritative TSS", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetTssDelta: 70,
      primaryActivityCategory: "bike",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Stale plan",
          structure: structureForActivityCategory("bike"),
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
      primaryActivityCategory: "run",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Bike plan",
          structure: structureForActivityCategory("bike"),
          authoritative_metrics: { estimated_tss: 70 },
        },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.empty_reason).toBe("low_confidence");
  });

  it("derives canonical activity_category from strict plan structure", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetTssDelta: 70,
      primaryActivityCategory: "run",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Tempo run",
          structure: structureForActivityCategory("run"),
          authoritative_metrics: { estimated_tss: 70 },
        },
      ],
    });

    expect(result.matches).toEqual([
      expect.objectContaining({
        activity_plan_id: "plan-1",
        activity_category: "run",
        reason_codes: expect.arrayContaining(["same_activity_category"]),
      }),
    ]);
  });
});
