import { describe, expect, it } from "vitest";
import { buildGoalIntelligence, interpretGoalReadiness } from "../../goals";

const raceGoal = {
  id: "33333333-3333-4333-8333-333333333333",
  profile_id: "11111111-1111-4111-8111-111111111111",
  target_date: "2026-06-01",
  title: "Spring 5K",
  priority: 8,
  activity_category: "run" as const,
  objective: {
    type: "event_performance" as const,
    activity_category: "run" as const,
    distance_m: 5000,
    target_time_s: 1500,
  },
};

describe("goal intelligence", () => {
  it("interprets readiness as athlete-facing states", () => {
    expect(interpretGoalReadiness(null)).toEqual({
      status: "uncertain",
      label: "Projection needs more data",
    });
    expect(interpretGoalReadiness(78).status).toBe("behind");
    expect(interpretGoalReadiness(88).status).toBe("slightly_behind");
    expect(interpretGoalReadiness(100).status).toBe("on_track");
    expect(interpretGoalReadiness(110).status).toBe("ahead");
    expect(interpretGoalReadiness(125).status).toBe("exceeding");
  });

  it("projects race finish time from readiness", () => {
    const intelligence = buildGoalIntelligence({
      goal: raceGoal,
      readinessScore: 108,
      confidence: 0.75,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(intelligence.status).toBe("ahead");
    expect(intelligence.projectedOutcome).toMatchObject({
      type: "finish_time",
      displayValue: "23:09",
    });
    expect(intelligence.summary).toContain("projecting 23:09");
    expect(intelligence.keyDrivers).toHaveLength(3);
  });

  it("returns an uncertainty state when readiness is unavailable", () => {
    const intelligence = buildGoalIntelligence({
      goal: raceGoal,
      readinessScore: null,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(intelligence.status).toBe("uncertain");
    expect(intelligence.projectedOutcome.displayValue).toBe("Projection unavailable");
    expect(intelligence.summary).toContain("More training data is needed");
  });
});
