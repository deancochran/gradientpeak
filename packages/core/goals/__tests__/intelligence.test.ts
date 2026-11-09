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
  it("abstains from trajectory classification at every readiness value", () => {
    expect(interpretGoalReadiness(null)).toEqual({
      status: "uncertain",
      label: "Outcome projection unavailable",
    });
    for (const score of [78, 88, 100, 110, 125]) {
      expect(interpretGoalReadiness(score).status).toBe("uncertain");
    }
  });

  it("provides heuristic readiness context without predicting a race finish time", () => {
    const intelligence = buildGoalIntelligence({
      goal: raceGoal,
      readinessScore: 108,
      confidence: 0.75,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(intelligence.status).toBe("uncertain");
    expect(intelligence.state).toBe("heuristic_context");
    expect(intelligence.reasonCodes).toEqual(["heuristic_readiness_not_predictive"]);
    expect(intelligence.projectedOutcome).toEqual({
      type: "finish_time",
      value: null,
      unit: "unknown",
      displayValue: "Projection unavailable",
      confidenceLow: null,
      confidenceHigh: null,
      confidenceDisplay: null,
    });
    expect(intelligence.summary).toBe(
      "No validated outcome projection is available for Spring 5K; the target remains 25:00.",
    );
    expect(JSON.stringify(intelligence)).not.toMatch(
      /23:09|completion confidence|projected completion rate|on track|ahead|behind/i,
    );
    expect(intelligence.keyDrivers).toHaveLength(3);
  });

  it("returns an uncertainty state when readiness is unavailable", () => {
    const intelligence = buildGoalIntelligence({
      goal: raceGoal,
      readinessScore: null,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });

    expect(intelligence.status).toBe("uncertain");
    expect(intelligence.state).toBe("unavailable");
    expect(intelligence.reasonCodes).toEqual(["readiness_unavailable"]);
    expect(intelligence.projectedOutcome.displayValue).toBe("Projection unavailable");
    expect(intelligence.projectedOutcome.value).toBeNull();
    expect(intelligence.projectedOutcome.confidenceLow).toBeNull();
    expect(intelligence.projectedOutcome.confidenceHigh).toBeNull();
    expect(intelligence.projectedOutcome.confidenceDisplay).toBeNull();
    expect(intelligence.summary).toBe(
      "No validated outcome projection is available for Spring 5K; the target remains 25:00.",
    );
  });
});
