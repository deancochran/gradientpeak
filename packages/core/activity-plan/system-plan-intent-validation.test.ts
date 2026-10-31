import { describe, expect, it } from "vitest";
import { SYSTEM_TEMPLATES } from "../samples";
import { validateActivityPlanIntent } from "./intent-validation";

describe("system activity-plan intent validation", () => {
  it("keeps every existing system activity plan inside its declared training intent", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    const incompatible = SYSTEM_TEMPLATES.flatMap((plan) => {
      const validation = validateActivityPlanIntent({
        intent: {
          training_intent: plan.training_intent,
        },
        structure: plan.structure,
      });
      return validation.status === "incompatible"
        ? [{ name: plan.name, violations: validation.violations }]
        : [];
    });
    expect(incompatible).toEqual([]);
  });
});
