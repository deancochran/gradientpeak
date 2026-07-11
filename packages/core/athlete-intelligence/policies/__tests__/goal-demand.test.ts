import { describe, expect, it } from "vitest";

import { calculateGoalDemandV1, GOAL_DEMAND_POLICY_VERSION } from "../goal-demand";

const header = {
  id: "11111111-1111-4111-8111-111111111111",
  profile_id: "22222222-2222-4222-8222-222222222222",
  target_date: "2027-07-10",
  title: "Goal",
  priority: 5,
  activity_category: "run" as const,
};

describe("calculateGoalDemandV1", () => {
  it("returns event distance, duration, derived speed, and explicit route context", () => {
    const routeSourceId = "activity:race-route";
    const result = calculateGoalDemandV1({
      goal: {
        ...header,
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10_000,
          target_time_s: 2_500,
        },
      },
      route: { sourceId: routeSourceId, distanceMeters: 10_200, ascentMeters: 350 },
    });

    expect(result).toMatchObject({ policyVersion: GOAL_DEMAND_POLICY_VERSION, state: "complete" });
    if (result.state !== "complete" || result.requirement.type !== "event_performance") return;
    expect(result.requirement.requiredDistance).toMatchObject({ estimate: 10_000, unit: "m" });
    expect(result.requirement.requiredDuration).toMatchObject({ estimate: 2_500, unit: "s" });
    expect(result.requirement.requiredSpeed).toMatchObject({ estimate: 4, unit: "m/s" });
    expect(result.requirement.routeDistance).toMatchObject({ estimate: 10_200, unit: "m" });
    expect(result.requirement.routeAscent).toMatchObject({ estimate: 350, unit: "m" });
    expect(result.requirement.routeDistance?.contributingSourceIds).toEqual([routeSourceId]);
    expect(result.requirement.routeAscent?.contributingSourceIds).toEqual([routeSourceId]);
    expect(result).not.toHaveProperty("dimensions");
  });

  it("estimates duration from a speed-only target with goal derivation lineage", () => {
    const result = calculateGoalDemandV1({
      goal: {
        ...header,
        objective: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10_000,
          target_speed_mps: 4,
        },
      },
    });

    expect(result.state).toBe("complete");
    if (result.state !== "complete" || result.requirement.type !== "event_performance") return;
    expect(result.requirement.requiredDuration).toMatchObject({
      estimate: 2_500,
      unit: "s",
      state: "estimated",
      reasonCodes: ["goal_duration_derived_from_distance_and_speed"],
      contributingSourceIds: [`goal:${header.id}`],
    });
    expect(result.requirement).not.toHaveProperty("routeDistance");
    expect(result.requirement).not.toHaveProperty("routeAscent");
  });

  it("rejects route context without a valid route source ID", () => {
    const goal = {
      ...header,
      objective: {
        type: "event_performance" as const,
        activity_category: "run" as const,
        distance_m: 10_000,
        target_time_s: 2_500,
      },
    };

    expect(() => {
      calculateGoalDemandV1({
        goal,
        // @ts-expect-error Runtime validation must reject route context without source lineage.
        route: { distanceMeters: 10_200 },
      });
    }).toThrow();
    expect(() =>
      calculateGoalDemandV1({
        goal,
        route: { sourceId: "route:", distanceMeters: 10_200 },
      }),
    ).toThrow();
  });

  it.each([
    ["pace", 4.2, "m/s"],
    ["power", 315, "W"],
    ["hr", 172, "bpm"],
  ] as const)("returns a canonical %s threshold target", (metric, value, unit) => {
    const result = calculateGoalDemandV1({
      goal: {
        ...header,
        objective: { type: "threshold", metric, value, test_duration_s: 1_200 },
      },
    });

    expect(result.state).toBe("complete");
    if (result.state !== "complete" || result.requirement.type !== "threshold") return;
    expect(result.requirement.target).toMatchObject({ estimate: value, unit });
    expect(result.requirement.testDuration).toMatchObject({ estimate: 1_200, unit: "s" });
  });

  it.each([
    [{ distance_m: 42_195 }, { requiredDistance: { estimate: 42_195, unit: "m" } }],
    [{ duration_s: 18_000 }, { requiredDuration: { estimate: 18_000, unit: "s" } }],
    [
      { distance_m: 100_000, duration_s: 36_000 },
      {
        requiredDistance: { estimate: 100_000, unit: "m" },
        requiredDuration: { estimate: 36_000, unit: "s" },
      },
    ],
  ])("returns direct completion requirements for %o", (values, expected) => {
    const result = calculateGoalDemandV1({
      goal: { ...header, objective: { type: "completion", ...values } },
    });
    expect(result.state).toBe("complete");
    if (result.state !== "complete" || result.requirement.type !== "completion") return;
    expect(result.requirement).toMatchObject(expected);
  });

  it("returns sessions per week and weeks for consistency", () => {
    const result = calculateGoalDemandV1({
      goal: {
        ...header,
        objective: { type: "consistency", target_sessions_per_week: 4, target_weeks: 12 },
      },
    });
    expect(result.state).toBe("complete");
    if (result.state !== "complete" || result.requirement.type !== "consistency") return;
    expect(result.requirement.sessionsPerWeek).toMatchObject({
      estimate: 4,
      unit: "sessions/week",
    });
    expect(result.requirement.weeks).toMatchObject({ estimate: 12, unit: "weeks" });
  });

  it.each([
    [
      { type: "event_performance", activity_category: "run" },
      ["objective.distance_m", "objective.target_time_s"],
    ],
    [{ type: "threshold", metric: "power", value: 300 }, ["objective.test_duration_s"]],
    [{ type: "consistency", target_weeks: 8 }, ["objective.target_sessions_per_week"]],
  ])("returns incomplete for missing physical requirements", (objective, missingFields) => {
    const result = calculateGoalDemandV1({ goal: { ...header, objective } });
    expect(result).toMatchObject({ state: "incomplete" });
    if (result.state !== "incomplete") return;
    expect(result.missingFields).toEqual(expect.arrayContaining(missingFields));
    expect(result).not.toHaveProperty("requirement");
  });

  it("returns unsupported for an unknown goal type", () => {
    const result = calculateGoalDemandV1({
      goal: { ...header, objective: { type: "body_composition", value: 70 } },
    });
    expect(result).toEqual({
      policyVersion: GOAL_DEMAND_POLICY_VERSION,
      state: "unsupported",
      goalSourceId: `goal:${header.id}`,
      missingFields: [],
    });
  });
});
