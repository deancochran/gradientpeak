import { describe, expect, it } from "vitest";

import type { CreationFeasibilitySafetySummary } from "../../schemas";
import {
  getCreateDisabledReason,
  getMinimumGoalGapDays,
  getTopBlockingIssues,
  mapProfileGoalsToValidationGoals,
} from "../creationBlockers";

describe("creation blockers", () => {
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

  it("maps profile goals into validation-shaped records", () => {
    const mapped = mapProfileGoalsToValidationGoals([
      {
        id: "goal-1",
        title: "Threshold",
        priority: 5,
        activity_category: "run",
        objective: {
          type: "threshold",
          metric: "hr",
          value: 172.4,
        },
      } as never,
    ]);

    expect(mapped).toEqual([
      {
        id: "goal-1",
        name: "Threshold",
        targetDate: "",
        priority: 5,
        targets: [
          {
            id: "goal-1-fallback-target",
            targetType: "hr_threshold",
            targetLthrBpm: 172,
          },
        ],
      },
    ]);
  });
});
