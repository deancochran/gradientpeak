import { describe, expect, it } from "vitest";
import type { CreationFeasibilitySafetySummary } from "@repo/core";
import {
  getCreateDisabledReason,
  getMinimumGoalGapDays,
  getTopBlockingIssues,
  validateTrainingPlanForm,
} from "../validation";

describe("training-plan form validation", () => {
  it("returns no errors for valid minimal form", () => {
    const errors = validateTrainingPlanForm({
      planStartDate: "2026-02-14",
      goals: [
        {
          name: "Spring race",
          targetDate: "2026-06-01",
          priority: 1,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "21.1",
              completionTimeHms: "1:40:00",
            },
          ],
        },
      ],
    });

    expect(errors).toEqual({});
  });

  it("flags required and format validation errors", () => {
    const errors = validateTrainingPlanForm({
      planStartDate: "bad-date",
      goals: [
        {
          name: "",
          targetDate: "2020-01-01",
          priority: 20,
          targets: [
            {
              targetType: "pace_threshold",
              paceMmSs: "4:99",
              testDurationHms: "20:00",
            },
          ],
        },
      ],
    });

    expect(errors["goals.0.name"]).toBe("Goal name is required");
    expect(errors["goals.0.priority"]).toBe(
      "Priority must be between 0 and 10",
    );
    expect(errors["goals.0.targets.0.paceMmSs"]).toBe("Pace must use mm:ss");
    expect(errors.planStartDate).toBe("Plan start date must use yyyy-mm-dd");
    expect(errors.goals).toBe("Each goal must include valid target details");
  });
});

describe("blocking issue consolidation", () => {
  const feasibilityFixture: CreationFeasibilitySafetySummary = {
    feasibility_band: "over-reaching",
    safety_band: "high-risk",
    feasibility_score: 0.2,
    safety_score: 0.1,
    confidence: 0.8,
    top_drivers: [{ code: "d1", message: "Driver", impact: -0.8 }],
    recommended_actions: [],
    blockers: [
      {
        code: "required_tss_ramp_exceeds_cap",
        message: "Required weekly load exceeds cap",
        field_paths: ["maxWeeklyTssRampPct"],
      },
      {
        code: "new_blocker",
        message: "Unique blocker from feasibility",
        field_paths: [],
      },
    ],
    computed_at: "2026-02-13T00:00:00.000Z",
  };

  it("dedupes blockers and limits display to top 3", () => {
    const issues = getTopBlockingIssues({
      conflictItems: [
        {
          code: "required_tss_ramp_exceeds_cap",
          severity: "blocking",
          message: "Required weekly load exceeds cap",
          suggestions: ["Lower target ramp"],
        },
        {
          code: "min_sessions_exceeds_max",
          severity: "blocking",
          message: "Min sessions exceeds max sessions",
          suggestions: ["Raise max sessions"],
        },
        {
          code: "max_sessions_exceeds_available_days",
          severity: "blocking",
          message: "Max sessions exceeds available days",
          suggestions: ["Lower max sessions"],
        },
        {
          code: "ignored-warning",
          severity: "warning",
          message: "Should not be included",
          suggestions: [],
        },
      ],
      feasibilitySafetySummary: feasibilityFixture,
    });

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.code)).toEqual([
      "min_sessions_exceeds_max",
      "max_sessions_exceeds_available_days",
      "new_blocker",
    ]);
    expect(issues.some((issue) => issue.code === "new_blocker")).toBe(true);
    expect(getCreateDisabledReason(issues)).toBe(
      "Create is disabled until 3 blocking conflicts are resolved.",
    );
  });

  it("computes minimum goal gap days", () => {
    expect(
      getMinimumGoalGapDays([
        { targetDate: "2026-05-01" },
        { targetDate: "2026-05-30" },
        { targetDate: "bad-date" },
      ]),
    ).toBe(29);
  });
});
