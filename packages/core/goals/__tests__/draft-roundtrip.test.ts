import { describe, expect, it } from "vitest";
import type { CanonicalGoalObjective, ProfileGoal } from "../../schemas/goals/profile_goals";
import * as draftApi from "../draft";
import * as legacyApi from "../goalDraft";

const profileId = "11111111-1111-4111-8111-111111111111";
const objectives: CanonicalGoalObjective[] = [
  { type: "event_performance", activity_category: "run", distance_m: 42195, target_time_s: 14401 },
  { type: "event_performance", activity_category: "swim", distance_m: 25, target_time_s: 19 },
  {
    type: "event_performance",
    activity_category: "run",
    distance_m: 1234.56,
    target_speed_mps: 3.12345,
  },
  {
    type: "event_performance",
    activity_category: "run",
    distance_m: 5000,
    target_time_s: 1500,
    target_speed_mps: 3.333,
    environment: "track",
    tolerance_pct: 0.05,
  },
  { type: "completion", distance_m: 42195 },
  { type: "completion", activity_category: "swim", distance_m: 25 },
  { type: "completion", duration_s: 3601 },
  { type: "completion", activity_category: "run", distance_m: 1234.56, duration_s: 333 },
  ...(["pace", "power", "hr"] as const).flatMap((metric): CanonicalGoalObjective[] => [
    { type: "threshold", metric, value: metric === "pace" ? 3.12345 : 171.5 },
    {
      type: "threshold",
      metric,
      activity_category: metric === "power" ? "bike" : "run",
      value: metric === "pace" ? 3.12345 : 171.5,
      test_duration_s: 1201,
      tolerance_pct: 0.02,
    },
  ]),
  { type: "consistency", target_sessions_per_week: 3 },
  { type: "consistency", target_weeks: 6 },
  { type: "consistency", target_sessions_per_week: 3, target_weeks: 6 },
  { type: "threshold", metric: "pace", activity_category: "swim", value: 1.12345 },
  { type: "threshold", metric: "power", activity_category: "run", value: 250 },
];

function goalFor(objective: CanonicalGoalObjective): ProfileGoal {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    profile_id: profileId,
    title: "Original goal",
    target_date: "2026-11-01",
    priority: 7,
    activity_category:
      "activity_category" in objective && objective.activity_category
        ? objective.activity_category
        : objective.type === "threshold" && objective.metric === "power"
          ? "bike"
          : "run",
    objective,
  };
}

describe.each([draftApi, legacyApi])("goal draft round trips (%#)", (api) => {
  it.each([
    {
      objective: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 42195.123,
        target_time_s: 15000,
        environment: "trail",
        tolerance_pct: 0.03,
      },
      patch: { targetDuration: "4:00:00" },
      expected: { target_time_s: 14400 },
    },
    {
      objective: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 1234.567,
        target_speed_mps: 3.123456,
      },
      patch: { raceDistanceKm: 2 },
      expected: { distance_m: 2000 },
    },
    {
      objective: { type: "completion", distance_m: 25.123 },
      patch: { targetDuration: "1:00" },
      expected: { duration_s: 60 },
    },
    {
      objective: {
        type: "threshold",
        metric: "pace",
        activity_category: "swim",
        value: 1.123456,
        tolerance_pct: 0.05,
      },
      patch: { thresholdTestDuration: "30:00" },
      expected: { test_duration_s: 1800 },
    },
    {
      objective: { type: "threshold", metric: "power", activity_category: "run", value: 250.125 },
      patch: { targetWatts: 275 },
      expected: { value: 275 },
    },
    {
      objective: { type: "threshold", metric: "hr", value: 171.125, test_duration_s: 1201 },
      patch: { targetBpm: 175 },
      expected: { value: 175 },
    },
    {
      objective: { type: "consistency", target_weeks: 6 },
      patch: { consistencyWeeks: 7 },
      expected: { target_weeks: 7 },
    },
  ] satisfies {
    objective: CanonicalGoalObjective;
    patch: Partial<draftApi.GoalEditorDraft>;
    expected: object;
  }[])("preserves other canonical fields when editing one target %#", ({
    objective,
    patch,
    expected,
  }) => {
    const draft = api.buildGoalDraftFromGoal({ goal: goalFor(objective) });
    expect(
      api.buildGoalUpdatePayload({ draft: { ...draft, ...patch } }).target_payload,
    ).toStrictEqual({ ...objective, ...expected });
  });

  it("rebuilds a changed variant without leaking the old metadata", () => {
    const draft = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "threshold", metric: "power", value: 250, tolerance_pct: 0.03 }),
    });
    expect(
      api.buildGoalUpdatePayload({ draft: { ...draft, goalType: "completion", raceDistanceKm: 5 } })
        .target_payload,
    ).toStrictEqual({ type: "completion", activity_category: "bike", distance_m: 5000 });
  });

  it("clears optional fields explicitly and replaces the selected race target mode", () => {
    const draft = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "completion", distance_m: 25.123, duration_s: 60 }),
    });
    expect(
      api.buildGoalUpdatePayload({ draft: { ...draft, targetDuration: "" } }).target_payload,
    ).toStrictEqual({ type: "completion", distance_m: 25.123 });
    const race = api.buildGoalDraftFromGoal({
      goal: goalFor({
        type: "event_performance",
        activity_category: "run",
        distance_m: 42195.123,
        target_time_s: 14400,
      }),
    });
    expect(
      api.buildGoalUpdatePayload({ draft: { ...race, raceTargetMode: "pace", targetPace: "5:00" } })
        .target_payload,
    ).toStrictEqual({
      type: "event_performance",
      activity_category: "run",
      distance_m: 42195.123,
      target_speed_mps: 1000 / 300,
    });
  });
  it.each(
    objectives,
  )("preserves canonical objective %# on unchanged and title-only saves", (objective) => {
    const goal = goalFor(objective);
    const draft = api.buildGoalDraftFromGoal({ goal });
    for (const title of [goal.title, "Renamed goal"]) {
      const payload = api.buildGoalUpdatePayload({ draft: { ...draft, title } });
      expect(payload).toStrictEqual({
        title,
        target_date: goal.target_date,
        priority: goal.priority,
        activity_category: goal.activity_category,
        target_payload: objective,
      });
    }
  });

  it.each([42195, 25, 1234.56])("hydrates exact distance %s meters", (distance_m) => {
    const draft = api.buildGoalDraftFromGoal({ goal: goalFor({ type: "completion", distance_m }) });
    expect(draft.raceDistanceKm).toBe(distance_m / 1000);
  });

  it("keeps absent edit fields empty and creation defaults intentional", () => {
    const sessions = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "consistency", target_sessions_per_week: 3 }),
    });
    const weeks = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "consistency", target_weeks: 6 }),
    });
    expect(sessions.consistencyWeeks).toBeNull();
    expect(weeks.consistencySessionsPerWeek).toBeNull();
    for (const metric of ["pace", "power", "hr"] as const) {
      expect(
        api.buildGoalDraftFromGoal({ goal: goalFor({ type: "threshold", metric, value: 3 }) })
          .thresholdTestDuration,
      ).toBe("");
    }
    expect(api.createEmptyGoalDraft()).toMatchObject({
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
      thresholdTestDuration: "0:20:00",
    });
  });

  it.each([
    "invalid",
    "1:",
    "10:99",
    "0:00",
  ])("rejects nonempty invalid completion duration %s", (targetDuration) => {
    const draft = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "completion", distance_m: 5000 }),
    });
    expect(() => api.buildGoalUpdatePayload({ draft: { ...draft, targetDuration } })).toThrow();
  });

  it("applies real edits instead of restoring the original objective", () => {
    const draft = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "completion", activity_category: "run", distance_m: 25 }),
    });
    expect(
      api.buildGoalUpdatePayload({
        draft: { ...draft, raceDistanceKm: 0.05, targetDuration: "1:30" },
      }).target_payload,
    ).toEqual({ type: "completion", activity_category: "run", distance_m: 50, duration_s: 90 });
  });

  it("allows threshold target edits while keeping an absent duration unset", () => {
    const draft = api.buildGoalDraftFromGoal({
      goal: goalFor({ type: "threshold", metric: "power", activity_category: "bike", value: 200 }),
    });
    const target = api.buildGoalUpdatePayload({
      draft: { ...draft, targetWatts: 220 },
    }).target_payload;
    expect(target).toMatchObject({ type: "threshold", value: 220 });
    expect("test_duration_s" in target ? target.test_duration_s : undefined).toBeUndefined();
  });

  it("preserves creation defaults when creating consistency and power goals", () => {
    const base = { ...api.createEmptyGoalDraft(), title: "New goal", targetDate: "2026-11-01" };
    expect(
      api.buildGoalCreatePayload({
        profileId,
        draft: { ...base, goalType: "consistency" },
      }).target_payload,
    ).toEqual({ type: "consistency", target_sessions_per_week: 4, target_weeks: 8 });
    expect(
      api.buildGoalCreatePayload({
        profileId,
        draft: { ...base, goalType: "power_threshold", targetWatts: 250 },
      }).target_payload,
    ).toMatchObject({ value: 250, test_duration_s: 1200 });
  });
});
