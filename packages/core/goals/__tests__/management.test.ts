import { describe, expect, it } from "vitest";
import {
  createEmptyGoalDraft,
  getGoalDraftQualityFeedback,
  getProfileGoalLifecycleStatus,
} from "../../goals";

const today = new Date("2026-05-07T12:00:00.000Z");

describe("goal management", () => {
  it.each([
    "2026-03-08",
    "2026-11-01",
  ])("uses the device calendar across midnight and DST (%s)", (date) => {
    for (const hour of [0, 23]) {
      const now = new Date(`${date}T${String(hour).padStart(2, "0")}:30:00`);
      const draft = {
        ...createEmptyGoalDraft(),
        title: "Today",
        targetDate: date,
        targetDuration: "30:00",
      };
      expect(getGoalDraftQualityFeedback({ draft, today: now }).canGuidePlan).toBe(true);
      const goal = {
        id: "33333333-3333-4333-8333-333333333333",
        profile_id: "11111111-1111-4111-8111-111111111111",
        target_date: date,
        title: "Today",
        priority: 5,
        activity_category: "run" as const,
        objective: { type: "completion" as const, distance_m: 5000 },
      };
      expect(getProfileGoalLifecycleStatus({ goal, today: now }).status).toBe("in_progress");
      const yesterday = date === "2026-03-08" ? "2026-03-07" : "2026-10-31";
      expect(
        getProfileGoalLifecycleStatus({ goal: { ...goal, target_date: yesterday }, today: now })
          .status,
      ).toBe("completed");
    }
  });
  it("accepts an explicitly resolved planning day and rejects invalid calendar keys", () => {
    const draft = {
      ...createEmptyGoalDraft(),
      title: "Plan",
      targetDate: "2026-03-08",
      targetDuration: "30:00",
    };
    expect(
      getGoalDraftQualityFeedback({
        draft,
        todayDate: "2026-03-08",
        today: new Date("2027-01-01T00:00:00Z"),
      }).canGuidePlan,
    ).toBe(true);
    expect(() => getGoalDraftQualityFeedback({ draft, todayDate: "2026-02-30" })).toThrow();
    expect(
      getGoalDraftQualityFeedback({
        draft: { ...draft, targetDate: "bad" },
        todayDate: "2026-03-08",
      }).missing,
    ).toContain("date");
  });
  it.each([
    "pace_threshold",
    "power_threshold",
  ] as const)("does not require an optional test duration for %s readiness", (goalType) => {
    const feedback = getGoalDraftQualityFeedback({
      today,
      draft: {
        ...createEmptyGoalDraft(),
        title: "Threshold",
        targetDate: "2026-06-01",
        goalType,
        targetPace: "5:00",
        targetWatts: 250,
        thresholdTestDuration: "",
      },
    });
    expect(feedback.canGuidePlan).toBe(true);
    expect(feedback.missing).toEqual([]);
  });
  it("identifies missing draft fields", () => {
    const feedback = getGoalDraftQualityFeedback({ draft: createEmptyGoalDraft(), today });

    expect(feedback.status).toBe("draft");
    expect(feedback.missing).toEqual(["name", "date", "target"]);
    expect(feedback.canGuidePlan).toBe(false);
  });

  it("marks complete drafts as plan-ready", () => {
    const feedback = getGoalDraftQualityFeedback({
      draft: {
        ...createEmptyGoalDraft(),
        title: "Spring 5K",
        targetDate: "2026-06-01",
        targetDuration: "0:25:00",
      },
      today,
    });

    expect(feedback.status).toBe("ready");
    expect(feedback.canGuidePlan).toBe(true);
  });

  it("maps existing goals to lifecycle labels", () => {
    const goal = {
      id: "33333333-3333-4333-8333-333333333333",
      profile_id: "11111111-1111-4111-8111-111111111111",
      target_date: "2026-04-01",
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

    expect(getProfileGoalLifecycleStatus({ goal, today }).label).toBe("Completed");
  });
});
