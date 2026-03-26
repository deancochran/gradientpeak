import { describe, expect, it } from "vitest";
import {
  createFromCreationConfigInputSchema,
  getCreationSuggestionsInputSchema,
} from "../../contracts";
import {
  minimalTrainingPlanCreateSchema,
  periodizedPlanCreateSchema,
  trainingPlanCreationConfigSchema,
} from "../../schemas/training_plan_structure";
import { normalizeCreationConfig } from "../normalizeCreationConfig";

const goalOneId = "11111111-1111-4111-8111-111111111111";
const goalTwoId = "22222222-2222-4222-8222-222222222222";

const periodizedBase = {
  plan_type: "periodized" as const,
  name: "Two-goal build plan",
  start_date: "2026-01-05",
  end_date: "2026-04-20",
  fitness_progression: {
    starting_ctl: 44,
  },
  activity_distribution: {
    run: { target_percentage: 0.8 },
    bike: { target_percentage: 0.2 },
  },
  blocks: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Build 1",
      start_date: "2026-01-05",
      end_date: "2026-02-15",
      goal_ids: [goalOneId],
      phase: "build" as const,
      target_weekly_tss_range: { min: 300, max: 380 },
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Build 2",
      start_date: "2026-02-16",
      end_date: "2026-04-20",
      goal_ids: [goalTwoId],
      phase: "build" as const,
      target_weekly_tss_range: { min: 320, max: 420 },
    },
  ],
};

describe("training plan schema simplification guardrails", () => {
  it("preserves minimal-plan timeline bounds for multi-goal input", () => {
    const valid = minimalTrainingPlanCreateSchema.safeParse({
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

    const invalid = minimalTrainingPlanCreateSchema.safeParse({
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

  it("accepts periodized plan structures without embedded goals", () => {
    const valid = periodizedPlanCreateSchema.safeParse(periodizedBase);
    expect(valid.success).toBe(true);
  });

  it("preserves no-overlap invariant for periodized blocks", () => {
    const overlapping = periodizedPlanCreateSchema.safeParse({
      ...periodizedBase,
      blocks: [
        periodizedBase.blocks[0],
        {
          ...periodizedBase.blocks[1],
          start_date: "2026-02-10",
        },
      ],
    });

    expect(overlapping.success).toBe(false);
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
      {
        name: "create input rejects removed legacy mode field",
        ok: createFromCreationConfigInputSchema.safeParse({
          minimal_plan: {
            goals: [
              {
                name: "A",
                target_date: "2026-06-01",
                targets: [{ target_type: "hr_threshold", target_lthr_bpm: 170 }],
              },
            ],
          },
          creation_input: {
            mode: "risk_accepted",
          },
        }).success,
      },
      {
        name: "suggestions input rejects alias recent_influence_score",
        ok: getCreationSuggestionsInputSchema.safeParse({
          existing_values: {
            recent_influence_score: 0.4,
          },
        }).success,
      },
    ];

    expect(cases.every((entry) => entry.ok === false)).toBe(true);
  });

  it("keeps calibration override behavior stable: partial accepted, invalid rejected", () => {
    const partialAccepted = createFromCreationConfigInputSchema.safeParse({
      minimal_plan: {
        goals: [
          {
            name: "A",
            target_date: "2026-06-01",
            targets: [{ target_type: "hr_threshold", target_lthr_bpm: 170 }],
          },
        ],
      },
      creation_input: {
        user_values: {
          calibration: {
            optimizer: {
              lookahead_weeks: 7,
            },
          },
        },
      },
    });

    const invalidParsed = createFromCreationConfigInputSchema.parse({
      minimal_plan: {
        goals: [
          {
            name: "A",
            target_date: "2026-06-01",
            targets: [{ target_type: "hr_threshold", target_lthr_bpm: 170 }],
          },
        ],
      },
      creation_input: {
        user_values: {
          calibration: {
            readiness_composite: {
              target_attainment_weight: 0.5,
              envelope_weight: 0.5,
              durability_weight: 0.5,
              evidence_weight: 0.5,
            },
          },
        },
      },
    });

    expect(partialAccepted.success).toBe(true);
    expect(() => normalizeCreationConfig(invalidParsed.creation_input)).toThrow();
  });
});
