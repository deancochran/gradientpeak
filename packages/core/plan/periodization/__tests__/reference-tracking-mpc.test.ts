import { describe, expect, it } from "vitest";
import { referenceTrajectorySchema } from "../../../schemas/planning";
import { evaluateMpcObjective } from "../../projection/mpc/objective";
import { buildPeriodizedObjectiveComponents, evaluateReferenceTrackingWindow } from "../index";

const taperReference = referenceTrajectorySchema.parse({
  mode: "target_seeking",
  activity_category: "run",
  feasibility: {
    status: "feasible",
    limiting_constraints: [],
    rationale_codes: [],
  },
  calculated_parameters: {},
  points: [
    {
      date: "2026-04-14",
      target_longTermLoad: 55,
      target_load: 52,
      phase: "build",
      goal_ids_in_effect: [],
      rationale_codes: [],
    },
    {
      date: "2026-04-15",
      target_longTermLoad: 55,
      target_load: 40,
      phase: "taper",
      goal_ids_in_effect: ["11111111-1111-4111-8111-111111111111"],
      rationale_codes: [],
    },
    {
      date: "2026-04-16",
      target_longTermLoad: 54,
      target_load: 28,
      phase: "taper",
      goal_ids_in_effect: ["11111111-1111-4111-8111-111111111111"],
      rationale_codes: [],
    },
  ],
});

describe("reference tracking MPC helpers", () => {
  it("increases taper pressure when projected load overshoots the taper window", () => {
    const conservative = evaluateReferenceTrackingWindow({
      reference_trajectory: taperReference,
      projected_states: taperReference.points.map((point) => ({
        date: point.date,
        predicted_load: point.target_load,
        predicted_fitness_longTermLoad: point.target_longTermLoad,
        predicted_fatigue_recentLoad: point.target_longTermLoad + 3,
        predicted_form_loadBalance: -3,
      })),
    });
    const aggressive = evaluateReferenceTrackingWindow({
      reference_trajectory: taperReference,
      projected_states: taperReference.points.map((point) => ({
        date: point.date,
        predicted_load: point.target_load + 36,
        predicted_fitness_longTermLoad: point.target_longTermLoad + 3,
        predicted_fatigue_recentLoad: point.target_longTermLoad + 22,
        predicted_form_loadBalance: -18,
      })),
    });

    expect(aggressive.taper_pressure).toBeGreaterThan(conservative.taper_pressure);
    expect(aggressive.safety_penalty).toBeGreaterThan(conservative.safety_penalty);
    expect(aggressive.tracking_error).toBeGreaterThan(conservative.tracking_error);
  });

  it("reduces objective utility when safety and tracking penalties outweigh readiness", () => {
    const alignedTracking = evaluateReferenceTrackingWindow({
      reference_trajectory: taperReference,
      projected_states: taperReference.points.map((point) => ({
        date: point.date,
        predicted_load: point.target_load + 2,
        predicted_fitness_longTermLoad: point.target_longTermLoad,
        predicted_fatigue_recentLoad: point.target_longTermLoad + 5,
        predicted_form_loadBalance: -5,
      })),
    });
    const overshootTracking = evaluateReferenceTrackingWindow({
      reference_trajectory: taperReference,
      projected_states: taperReference.points.map((point) => ({
        date: point.date,
        predicted_load: point.target_load + 40,
        predicted_fitness_longTermLoad: point.target_longTermLoad + 4,
        predicted_fatigue_recentLoad: point.target_longTermLoad + 24,
        predicted_form_loadBalance: -19,
      })),
    });

    const alignedObjective = evaluateMpcObjective({
      components: buildPeriodizedObjectiveComponents({
        preparedness_primary: 0.7,
        preparedness_secondary: 0.7,
        overload_penalty: 0.25,
        volatility_penalty: 0.08,
        churn_penalty: 0.06,
        monotony_penalty: 0,
        strain_penalty: 0,
        curvature_penalty: 0,
        reference_tracking: alignedTracking,
      }),
    });
    const overshootObjective = evaluateMpcObjective({
      components: buildPeriodizedObjectiveComponents({
        preparedness_primary: 0.75,
        preparedness_secondary: 0.75,
        overload_penalty: 0.25,
        volatility_penalty: 0.08,
        churn_penalty: 0.06,
        monotony_penalty: 0,
        strain_penalty: 0,
        curvature_penalty: 0,
        reference_tracking: overshootTracking,
      }),
    });

    expect(overshootObjective.objective_score).toBeLessThan(alignedObjective.objective_score);
  });
});
