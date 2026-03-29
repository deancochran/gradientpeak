import { describe, expect, it } from "vitest";

import {
  buildGoalCreatePayload,
  buildGoalDraftFromGoal,
  createEmptyGoalDraft,
  getGoalMetricSummary,
  getGoalObjectiveSummary,
} from "../draft";

const profileId = "11111111-1111-4111-8111-111111111111";
const milestoneEventId = "22222222-2222-4222-8222-222222222222";

describe("goal draft helpers", () => {
  it("builds a race payload from athlete-friendly pace input", () => {
    const payload = buildGoalCreatePayload({
      profileId,
      milestoneEventId,
      draft: {
        ...createEmptyGoalDraft(),
        title: "Spring 10K",
        targetDate: "2026-06-01",
        goalType: "race_performance",
        activityCategory: "run",
        raceDistanceKm: 10,
        raceTargetMode: "pace",
        targetPace: "4:15",
      },
    });

    expect(payload.target_payload).toEqual({
      type: "event_performance",
      activity_category: "run",
      distance_m: 10000,
      target_speed_mps: expect.closeTo(1000 / 255, 6),
    });
  });

  it("rejects race goals without an explicit user target", () => {
    expect(() =>
      buildGoalCreatePayload({
        profileId,
        milestoneEventId,
        draft: {
          ...createEmptyGoalDraft(),
          title: "Spring 10K",
          targetDate: "2026-06-01",
          goalType: "race_performance",
          activityCategory: "run",
          raceDistanceKm: 10,
          raceTargetMode: "time",
          targetDuration: "",
        },
      }),
    ).toThrow("Set a goal time before saving this goal.");
  });

  it("hydrates friendly editing fields from canonical goals", () => {
    const draft = buildGoalDraftFromGoal({
      targetDate: "2026-06-01",
      goal: {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: profileId,
        milestone_event_id: milestoneEventId,
        title: "Raise FTP",
        priority: 7,
        activity_category: "bike",
        objective: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 285,
          test_duration_s: 1200,
        },
      },
    });

    expect(draft.goalType).toBe("power_threshold");
    expect(draft.targetWatts).toBe(285);
    expect(draft.thresholdTestDuration).toBe("20:00");
  });

  it("formats user-facing goal summaries", () => {
    const goal = {
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: profileId,
      milestone_event_id: milestoneEventId,
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

    expect(getGoalMetricSummary(goal)).toEqual({
      label: "Goal time",
      value: "25:00",
    });
    expect(getGoalObjectiveSummary(goal)).toBe("5 km · 25:00");
  });
});
