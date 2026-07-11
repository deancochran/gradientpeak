import { describe, expect, it } from "vitest";
import { buildScheduleRecommendation } from "../scheduleRecommendation";

const upcomingImpact = [
  {
    activity_plan_id: "activity-plan-1",
    title: "Tempo ride",
    scheduled_at: "2026-07-16T12:00:00.000Z",
    sport: "cycling",
    estimated_load: 65,
    short_term_readiness_delta: null,
    fitness_contribution: null,
    confidence: "medium" as const,
    explanation: "Upcoming session impact.",
  },
];

describe("buildScheduleRecommendation", () => {
  it("recommends adding load from the current week when a plan gap has positive delta", () => {
    const recommendation = buildScheduleRecommendation({
      today: "2026-07-15",
      readinessForecast: { gap_summary: { type: "plan_gap" } },
      loadComparison: {
        weeks: [
          {
            week_start: "2026-07-13",
            scheduled_load: 120,
            recommended_load: 150.3,
          },
        ],
      },
      upcomingImpact: [],
    });

    expect(recommendation).toEqual({
      type: "add_load",
      label: "Adjust schedule",
      description:
        "Add about 30 TSS this week or schedule one moderate session to approach the recommended load.",
      target_date: "2026-07-13",
      target_week_start: "2026-07-13",
      target_load_delta: 30.3,
    });
  });

  it("does not use a readiness gap when planned-load comparison values are unsupported", () => {
    const recommendation = buildScheduleRecommendation({
      today: "2026-07-15",
      readinessForecast: { gap_summary: { type: "plan_gap" } },
      loadComparison: {
        weeks: [
          {
            week_start: "2026-07-13",
            scheduled_load: null,
            recommended_load: 150,
          },
        ],
      },
      upcomingImpact: [],
    });

    expect(recommendation).toEqual({
      type: "add_schedule_detail",
      label: "Add schedule details",
      description:
        "Add duration and intensity so scheduled load can be compared with the recommended load.",
      target_date: "2026-07-13",
      target_week_start: "2026-07-13",
      target_load_delta: null,
    });
  });

  it("prioritizes reviewing the next upcoming session when there is no gap recommendation", () => {
    const recommendation = buildScheduleRecommendation({
      today: "2026-07-15",
      readinessForecast: { gap_summary: null },
      loadComparison: null,
      upcomingImpact,
    });

    expect(recommendation).toMatchObject({
      type: "review_session",
      target_date: "2026-07-16",
      target_week_start: null,
      target_load_delta: null,
    });
  });
});
