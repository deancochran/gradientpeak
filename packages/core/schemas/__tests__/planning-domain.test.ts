import { describe, expect, it } from "vitest";
import {
  canonicalSportSchema,
  dailyAllocationTargetSchema,
  feasibilityAssessmentSchema,
  referenceTrajectorySchema,
  weeklyAllocationBudgetSchema,
} from "../index";

describe("planning domain schemas", () => {
  it("accepts canonical planning sports including strength", () => {
    expect(canonicalSportSchema.parse("strength")).toBe("strength");
  });

  it("rejects unordered reference trajectory points", () => {
    const result = referenceTrajectorySchema.safeParse({
      mode: "target_seeking",
      sport: "run",
      points: [
        {
          date: "2026-03-02",
          target_ctl: 45,
          target_tss: 420,
          phase: "build",
          goal_ids_in_effect: [],
          rationale_codes: [],
        },
        {
          date: "2026-03-01",
          target_ctl: 44,
          target_tss: 380,
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
        sport: "bike",
        target_tss: 55,
        rationale_codes: ["base_target"],
      }),
    ).toMatchObject({ sport: "bike", target_tss: 55 });

    const invalidBudget = weeklyAllocationBudgetSchema.safeParse({
      week_start_date: "2026-03-03",
      sport: "run",
      target_tss: 300,
      min_tss: 320,
      max_tss: 300,
      rationale_codes: [],
    });

    expect(invalidBudget.success).toBe(false);
  });
});
