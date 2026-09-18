import { describe, expect, it } from "vitest";
import { activityPlanAuthoringContentSchema } from "../../activity-plan";
import { createSystemActivityPlanBuilder } from "../activity-plan-builder";
import * as sourceExports from "../index";
import { SYSTEM_TEMPLATES } from "../index";

describe("system activity-plan authoring policy", () => {
  it.each(
    SYSTEM_TEMPLATES,
  )("validates $name including every permitted adaptation state", (plan) => {
    const result = activityPlanAuthoringContentSchema.safeParse({
      structure: plan.structure,
      intent: { training_intent: plan.training_intent },
      adaptation: plan.adaptation,
    });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("validates individual exported source templates, including non-registry development examples", () => {
    let checked = 0;
    for (const [name, value] of Object.entries(sourceExports)) {
      if (!value || typeof value !== "object" || !("structure" in value)) continue;
      const structure = value.structure;
      if (
        !structure ||
        typeof structure !== "object" ||
        !("version" in structure) ||
        structure.version !== 3
      )
        continue;
      const result = activityPlanAuthoringContentSchema.safeParse({
        structure,
        intent: {
          training_intent:
            "training_intent" in value
              ? (value.training_intent ?? "general_maintenance")
              : "general_maintenance",
        },
        adaptation: "adaptation" in value ? value.adaptation : null,
      });
      expect(result.error?.issues ?? [], name).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("preserves explicitly authored purposes regardless of step names", () => {
    const structure = createSystemActivityPlanBuilder("run", "explicit-purpose")
      .step({
        name: "Recovery",
        purpose: "work",
        duration: { type: "time", seconds: 60 },
        targets: [{ type: "RPE", intensity: 5 }],
      })
      .build();
    expect(structure.segments[0]).toMatchObject({
      intervals: [{ steps: [{ name: "Recovery", purpose: "work" }] }],
    });
  });
});
