import { compileActivityPlan, SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it } from "vitest";
import { buildUpcomingActivityImpact } from "../upcomingActivityImpact";

function structureForActivityCategory(activity_category: "bike") {
  const template = SYSTEM_TEMPLATES.find(
    (candidate) => compileActivityPlan(candidate.structure).activity_category === activity_category,
  );
  if (!template) throw new Error(`Missing ${activity_category} system template`);
  return template.structure;
}

describe("buildUpcomingActivityImpact", () => {
  it("returns only supported planned-load context", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: {
            id: "plan-1",
            name: "Tempo ride",
            structure: structureForActivityCategory("bike"),
          },
        },
      ],
      estimatedTssByPlanId: new Map([["plan-1", 65]]),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      estimated_load: 65,
      activity_category: "bike",
      confidence: "medium",
      explanation: "This session's planned load is above the recommended daily load.",
    });
    expect(impact).not.toHaveProperty("short_term_readiness_delta");
    expect(impact).not.toHaveProperty("fitness_contribution");
  });

  it("gives an explicit reason when planned load cannot be estimated", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: {
            id: "plan-1",
            name: "Tempo ride",
            structure: structureForActivityCategory("bike"),
          },
        },
      ],
      estimatedTssByPlanId: new Map(),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      estimated_load: null,
      confidence: "low",
      explanation:
        "Add duration and intensity to compare this session's planned load with the recommended daily load.",
    });
    expect(impact).not.toHaveProperty("short_term_readiness_delta");
    expect(impact).not.toHaveProperty("fitness_contribution");
  });

  it("omits a planned impact whose linked plan is not canonical", () => {
    const impact = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: { id: "plan-1", name: "Legacy plan", structure: { version: 2 } },
        },
      ],
      estimatedTssByPlanId: new Map([["plan-1", 65]]),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toEqual([]);
  });
});
