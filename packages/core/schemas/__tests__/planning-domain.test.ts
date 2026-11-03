import { describe, expect, it } from "vitest";
import {
  canonicalActivityCategorySchema,
  dailyAllocationTargetSchema,
  feasibilityAssessmentSchema,
  referenceTrajectorySchema,
  weeklyAllocationBudgetSchema,
} from "../index";

describe("planning domain schemas", () => {
  it("accepts canonical planning activity_categories including strength", () => {
    expect(canonicalActivityCategorySchema.parse("strength")).toBe("strength");
  });

  it("rejects unordered reference trajectory points", () => {
    const result = referenceTrajectorySchema.safeParse({
      mode: "target_seeking",
      activity_category: "run",
      points: [
        {
          date: "2026-03-02",
          target_longTermLoad: 45,
          target_load: 420,
          phase: "build",
          goal_ids_in_effect: [],
          rationale_codes: [],
        },
        {
          date: "2026-03-01",
          target_longTermLoad: 44,
          target_load: 380,
          phase: "build",
          goal_ids_in_effect: [],
          rationale_codes: [],
        },
      ],
      feasibility: feasibilityAssessmentSchema.parse({
        status: "feasible",
        limiting_constraints: [],
        rationale_codes: [],
      }),
      calculated_parameters: {},
    });

    expect(result.success).toBe(false);
  });

  it("validates reusable allocation targets", () => {
    expect(
      dailyAllocationTargetSchema.parse({
        date: "2026-03-01",
        activity_category: "bike",
        target_load: 55,
        rationale_codes: ["base_target"],
      }),
    ).toMatchObject({ activity_category: "bike", target_load: 55 });

    const invalidBudget = weeklyAllocationBudgetSchema.safeParse({
      week_start_date: "2026-03-03",
      activity_category: "run",
      target_load: 300,
      min_load: 320,
      max_load: 300,
      rationale_codes: [],
    });

    expect(invalidBudget.success).toBe(false);
  });
});
