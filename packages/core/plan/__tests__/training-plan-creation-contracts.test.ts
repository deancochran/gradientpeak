import { describe, expect, it } from "vitest";
import {
  createFromCreationConfigInputSchema,
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

  it("validates creation config form payload without risk acknowledgement", () => {
    const base = normalizeCreationConfig({});
    const result = trainingPlanCreationConfigFormSchema.safeParse(base);

    expect(result.success).toBe(true);
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
});
