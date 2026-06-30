import { describe, expect, it } from "vitest";
import { deriveTrainingPlanSchedulingPreview } from "../trainingPlanSchedulingPreview";

describe("training plan scheduling preview", () => {
  it("derives dated sessions and schedule conflicts without app state", () => {
    const preview = deriveTrainingPlanSchedulingPreview({
      startDate: "2026-06-01",
      preferredWeekdays: [1, 3, 5],
      sessionDateOverrides: {},
      sessions: [
        {
          id: "session-1",
          label: "Threshold ride",
          offsetDays: 0,
          estimatedTss: 95,
          intentType: "threshold",
        },
        {
          id: "session-2",
          label: "Long run",
          offsetDays: 1,
          estimatedTss: 100,
          intentType: "endurance",
        },
      ],
    });

    expect(preview.sessions.map((session) => session.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(preview.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(["non_preferred_day", "hard_session_spacing"]),
    );
  });
});
