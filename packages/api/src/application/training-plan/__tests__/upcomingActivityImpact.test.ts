import { describe, expect, it } from "vitest";
import { buildUpcomingActivityImpact } from "../upcomingActivityImpact";

describe("buildUpcomingActivityImpact", () => {
  it("preserves unsupported physiology fields as null and describes only planned load", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: { id: "plan-1", name: "Tempo ride" },
        },
      ],
      estimatedTssByPlanId: new Map([["plan-1", 65]]),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      estimated_load: 65,
      short_term_readiness_delta: null,
      fitness_contribution: null,
      confidence: "medium",
      explanation: "This session's planned load is above the recommended daily load.",
    });
  });

  it("gives an explicit reason when planned load cannot be estimated", () => {
    const [impact] = buildUpcomingActivityImpact({
      plannedActivities: [
        {
          id: "scheduled-1",
          scheduled_date: "2026-07-16",
          starts_at: "2026-07-16T12:00:00.000Z",
          activity_plan: { id: "plan-1", name: "Tempo ride" },
        },
      ],
      estimatedTssByPlanId: new Map(),
      today: "2026-07-15",
      horizonEnd: "2026-07-22",
      recommendedByDate: new Map([["2026-07-16", 40]]),
    });

    expect(impact).toMatchObject({
      estimated_load: null,
      short_term_readiness_delta: null,
      fitness_contribution: null,
      confidence: "low",
      explanation:
        "Add duration and intensity to compare this session's planned load with the recommended daily load.",
    });
  });
});
