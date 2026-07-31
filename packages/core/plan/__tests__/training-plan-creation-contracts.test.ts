import { describe, expect, it } from "vitest";
import { previewCreationConfigInputSchema } from "../../contracts";
import { trainingPlanCreationConfigFormSchema } from "../../schemas/form-schemas";
import {
  creationProvenanceSchema,
  trainingPlanCreationConfigSchema,
} from "../../schemas/training-plan-structure";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

const minimalPlan = {
  goals: [
    {
      name: "Spring Goal",
      target_date: "2026-06-01",
      priority: 1,
      targets: [
        {
          target_type: "hr_threshold",
          target_lthr_bpm: 170,
        },
      ],
    },
  ],
};

describe("training plan creation contracts", () => {
  it("requires a method version on creation provenance", () => {
    const provenance = {
      source: "suggested",
      confidence: 0.65,
      rationale: ["profile_derived_suggestion"],
      references: [{ type: "default_heuristic", id: "creation_suggestion" }],
      updated_at: "2026-07-30T00:00:00.000Z",
    };

    expect(creationProvenanceSchema.safeParse(provenance).success).toBe(false);
    expect(
      creationProvenanceSchema.safeParse({
        ...provenance,
        method_version: "creation-suggestions-v1",
      }).success,
    ).toBe(true);
  });

  it("parses preview input with minimal required fields", () => {
    const parsed = previewCreationConfigInputSchema.parse({
      minimal_plan: minimalPlan,
      creation_input: {},
    });

    expect(parsed.minimal_plan.goals).toHaveLength(1);
    expect(parsed.creation_input).toEqual({});
  });

  it("accepts structured preview baseline for readiness deltas", () => {
    const parsed = previewCreationConfigInputSchema.parse({
      minimal_plan: minimalPlan,
      creation_input: {},
      preview_baseline: {
        readiness_score: 70,
        predicted_load_tss: 420,
        predicted_fatigue_atl: 61,
        feasibility_state: "aggressive",
        tss_ramp_clamp_weeks: 1,
        ctl_ramp_clamp_weeks: 0,
      },
    });

    expect(parsed.preview_baseline?.feasibility_state).toBe("aggressive");
  });

  it("accepts the additive override_policy contract in preview input", () => {
    const previewParsed = previewCreationConfigInputSchema.parse({
      minimal_plan: minimalPlan,
      creation_input: {},
      override_policy: {
        allow_blocking_conflicts: true,
        scope: "objective_risk_budget",
        reason: "Coach-approved tradeoff",
      },
    });

    expect(previewParsed.override_policy?.allow_blocking_conflicts).toBe(true);
    expect(previewParsed.override_policy?.scope).toBe("objective_risk_budget");
  });

  it("accepts creation_input user overrides without legacy mode/risk fields", () => {
    const result = previewCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          optimization_profile: "sustainable",
          behavior_controls: {
            aggressiveness: 0.7,
            variability: 0.3,
            spike_frequency: 0.5,
            shape_target: -0.2,
            shape_strength: 0.8,
            recovery_priority: 0.6,
            starting_fitness_confidence: 0.4,
          },
          calibration_composite_locks: {
            target_attainment_weight: true,
            envelope_weight: false,
            durability_weight: true,
            evidence_weight: false,
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("validates creation config form payload without risk acknowledgement", () => {
    const base = normalizeCreationConfig({});
    const result = trainingPlanCreationConfigFormSchema.safeParse(base);

    expect(result.success).toBe(true);
  });

  describe("strictness matrix for unknown and legacy key rejection", () => {
    const base = normalizeCreationConfig({});

    const strictnessCases: Array<{
      name: string;
      run: () => boolean;
    }> = [
      {
        name: "active config rejects unknown top-level key",
        run: () =>
          trainingPlanCreationConfigSchema.safeParse({
            ...base,
            removed_tuning_control_key: {
              level: 0.8,
            },
          }).success,
      },
      {
        name: "active config rejects legacy mode field",
        run: () =>
          trainingPlanCreationConfigSchema.safeParse({
            ...base,
            mode: "safe_default",
          }).success,
      },
      {
        name: "active config rejects legacy mode/risk/policy group",
        run: () =>
          trainingPlanCreationConfigSchema.safeParse({
            ...base,
            mode: "risk_accepted",
            risk_acceptance: {
              accepted: true,
              reason: "Explicitly accept elevated risk",
              accepted_at_iso: "2026-02-14T10:15:00.000Z",
            },
            constraint_policy: {
              enforce_safety_caps: true,
              enforce_feasibility_caps: true,
              readiness_cap_enabled: false,
            },
          }).success,
      },
      {
        name: "preview input rejects legacy mode/risk/policy and removed cap keys",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              mode: "risk_accepted",
              risk_acceptance: {
                accepted: true,
                reason: "Explicitly accept elevated risk",
              },
              constraint_policy: {
                enforce_safety_caps: false,
              },
              user_values: {
                optimization_profile: "outcome_first",
                max_weekly_tss_ramp_pct: 8,
                max_ctl_ramp_per_week: 3,
              },
            },
          }).success,
      },
      {
        name: "preview input rejects removed cap aliases",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              user_values: {
                max_weekly_tss_ramp_pct: 8,
                max_ctl_ramp_per_week: 3,
              },
            },
          }).success,
      },
      {
        name: "preview input rejects legacy projection_control_v2 alias",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              user_values: {
                projection_control_v2: {
                  ambition: 0.8,
                },
              },
            },
          }).success,
      },
      {
        name: "preview input rejects retired behavior_controls_v1 field",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              user_values: {
                behavior_controls_v1: {
                  aggressiveness: 0.8,
                },
              },
            },
          }).success,
      },
      {
        name: "preview input rejects retired behavior_controls_v1 lock",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              user_values: {
                locks: {
                  behavior_controls_v1: { locked: true, locked_by: "user" },
                },
              },
            },
          }).success,
      },
      {
        name: "preview input rejects inferred duplicate alias recent_influence_score",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {
              user_values: {
                recent_influence_score: 0.4,
              },
            },
          }).success,
      },
      {
        name: "preview input rejects client-provided projection artifacts",
        run: () =>
          previewCreationConfigInputSchema.safeParse({
            minimal_plan: minimalPlan,
            creation_input: {},
            projection_chart: {
              readiness_score: 100,
            },
            creation_summary: {
              projection_chart: {
                readiness_score: 100,
              },
            },
          }).success,
      },
    ];

    it.each(strictnessCases)("$name", ({ run }) => {
      expect(run()).toBe(false);
    });
  });

  it("accepts partial calibration overrides in creation input", () => {
    const result = previewCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          calibration: {
            readiness_composite: {
              target_attainment_weight: 0.5,
              envelope_weight: 0.25,
              durability_weight: 0.15,
              evidence_weight: 0.1,
            },
            optimizer: {
              lookahead_weeks: 7,
            },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid calibration composite weight sums during normalization", () => {
    const parsed = previewCreationConfigInputSchema.parse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          calibration: {
            readiness_composite: {
              target_attainment_weight: 0.5,
              envelope_weight: 0.25,
              durability_weight: 0.2,
              evidence_weight: 0.1,
            },
          },
        },
      },
    });

    expect(() => normalizeCreationConfig(parsed.creation_input)).toThrow();
  });
});
