import { describe, expect, it } from "vitest";
import {
  createFromCreationConfigInputSchema,
  previewCreationConfigInputSchema,
} from "../../contracts";

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
});
