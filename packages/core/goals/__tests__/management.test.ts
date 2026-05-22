import { describe, expect, it } from "vitest";
import {
  createEmptyGoalDraft,
  getGoalDraftQualityFeedback,
  getProfileGoalLifecycleStatus,
} from "../../goals";

const today = new Date("2026-05-07T12:00:00.000Z");

describe("goal management", () => {
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
