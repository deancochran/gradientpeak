import { describe, expect, it } from "vitest";
import {
  goalProjectionInputSchema,
  trainingPlanCreationConfigSchema,
} from "../../schemas/training-plan-structure";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

describe("training plan schema simplification guardrails", () => {
  it("preserves pure projection timeline bounds for multi-goal input", () => {
    const valid = goalProjectionInputSchema.safeParse({
      plan_start_date: "2026-01-01",
      goals: [
        {
          name: "A",
          target_date: "2026-03-01",
          targets: [{ target_type: "hr_threshold", target_lthr_bpm: 170 }],
        },
        {
          name: "B",
          target_date: "2026-04-10",
          targets: [{ target_type: "hr_threshold", target_lthr_bpm: 172 }],
        },
      ],
    });

    const invalid = goalProjectionInputSchema.safeParse({
      plan_start_date: "2026-05-01",
      goals: [
        {
          name: "A",
          target_date: "2026-03-01",
          targets: [{ target_type: "hr_threshold", target_lthr_bpm: 170 }],
        },
      ],
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("keeps strict unknown-key rejection across core contract entrypoints", () => {
    const baseConfig = normalizeCreationConfig({});

    const cases: Array<{
      name: string;
      ok: boolean;
    }> = [
      {
        name: "active creation config schema rejects unknown top-level key",
        ok: trainingPlanCreationConfigSchema.safeParse({
          ...baseConfig,
          removed_tuning_control_key: 1,
        }).success,
      },
    ];

    expect(cases.every((entry) => entry.ok === false)).toBe(true);
  });
});
