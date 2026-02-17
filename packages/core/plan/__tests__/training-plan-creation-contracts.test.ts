import { describe, expect, it } from "vitest";
import {
  createFromCreationConfigInputSchema,
  getCreationSuggestionsInputSchema,
  previewCreationConfigInputSchema,
} from "../../contracts";
import { trainingPlanCreationConfigFormSchema } from "../../schemas/form-schemas";
import { trainingPlanCreationConfigSchema } from "../../schemas/training_plan_structure";
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

  it("create schema extends preview with is_active default and preview snapshot token", () => {
    const parsed = createFromCreationConfigInputSchema.parse({
      minimal_plan: minimalPlan,
      creation_input: {},
      preview_snapshot_token: "token-1",
    });

    expect(parsed.is_active).toBe(true);
    expect(parsed.preview_snapshot_token).toBe("token-1");
  });

  it("rejects empty preview snapshot token in create schema", () => {
    const result = createFromCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {},
      preview_snapshot_token: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts creation_input user overrides without legacy mode/risk fields", () => {
    const result = createFromCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          optimization_profile: "sustainable",
          max_weekly_tss_ramp_pct: 6,
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts projection_control_v2 partial user overrides", () => {
    const result = createFromCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          projection_control_v2: {
            ambition: 0.72,
            user_owned: {
              ambition: true,
            },
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

  it("backfills projection_control_v2 defaults in active creation config schema", () => {
    const base = normalizeCreationConfig({});
    const legacyShape: Partial<typeof base> = { ...base };
    delete legacyShape.projection_control_v2;
    const parsed = trainingPlanCreationConfigSchema.parse(legacyShape);

    expect(parsed.projection_control_v2).toEqual({
      mode: "simple",
      ambition: 0.5,
      risk_tolerance: 0.4,
      curvature: 0,
      curvature_strength: 0.35,
      user_owned: {
        mode: false,
        ambition: false,
        risk_tolerance: false,
        curvature: false,
        curvature_strength: false,
      },
    });
  });

  it("keeps active creation config schema strict about removed legacy fields", () => {
    const base = normalizeCreationConfig({});
    const result = trainingPlanCreationConfigSchema.safeParse({
      ...base,
      mode: "safe_default",
    });

    expect(result.success).toBe(false);
  });

  it("rejects removed mode/risk/policy fields from active config schema", () => {
    const base = normalizeCreationConfig({});
    const result = trainingPlanCreationConfigSchema.safeParse({
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
    });

    expect(result.success).toBe(false);
  });

  it("hard-rejects removed legacy fields in active preview/create inputs", () => {
    const result = createFromCreationConfigInputSchema.safeParse({
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
    });

    expect(result.success).toBe(false);
  });

  it("rejects inferred duplicate aliases in creation and suggestions inputs", () => {
    const createResult = createFromCreationConfigInputSchema.safeParse({
      minimal_plan: minimalPlan,
      creation_input: {
        user_values: {
          recent_influence_score: 0.4,
        },
      },
    });

    const suggestionsResult = getCreationSuggestionsInputSchema.safeParse({
      existing_values: {
        recent_influence_score: 0.4,
      },
    });

    expect(createResult.success).toBe(false);
    expect(suggestionsResult.success).toBe(false);
  });

  it("accepts partial calibration overrides in creation input", () => {
    const result = createFromCreationConfigInputSchema.safeParse({
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
    const parsed = createFromCreationConfigInputSchema.parse({
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
