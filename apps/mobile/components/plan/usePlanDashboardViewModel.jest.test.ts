import { mapUpcomingImpact } from "./usePlanDashboardViewModel";

describe("plan dashboard training-model safety", () => {
  it("keeps prohibited physiology claims out of upcoming session context", () => {
    const result = mapUpcomingImpact({
      activity_plan_id: "activity-1",
      title: "Endurance ride",
      scheduled_at: "2026-07-14T08:00:00.000Z",
      sport: "cycling",
      estimated_load: 72,
      short_term_readiness_delta: -8,
      fitness_contribution: 4,
      confidence: "high",
      explanation: "Physiological claim from the API",
    });
    const athleteCopy = result.loadContext.toLowerCase();

    expect(athleteCopy).not.toMatch(/readiness|fitness contribution|confidence|physiolog/);
    expect(result).not.toHaveProperty("readinessDelta");
    expect(result).not.toHaveProperty("fitnessContribution");
    expect(result).not.toHaveProperty("confidence");
  });

  it("keeps a missing load value unknown and explicitly unavailable", () => {
    const result = mapUpcomingImpact({
      activity_plan_id: "activity-1",
      title: "Endurance ride",
      scheduled_at: "2026-07-14T08:00:00.000Z",
      sport: "cycling",
      estimated_load: null,
      short_term_readiness_delta: null,
      fitness_contribution: null,
      confidence: "low",
      explanation: "",
    });

    expect(result.estimatedLoad).toBeNull();
    expect(result.loadContext).toBe("Scheduled session; load estimate unavailable.");
  });
});
