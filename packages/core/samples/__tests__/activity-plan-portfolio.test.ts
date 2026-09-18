import { describe, expect, it } from "vitest";
import { validateActivityPlanAdaptationSurface } from "../../activity-plan";
import {
  EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
  EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
  EXPANDED_ENDURANCE_RUN_ACTIVITIES,
  EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
  EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
  ICONIC_ENDURANCE_ACTIVITIES,
  SYSTEM_TEMPLATES,
} from "..";

const doseCopyName = /\s[—-]\s(?:base|build|advanced|race|foundation|development|race prep)\b/i;

describe("adaptation-only system activity catalog", () => {
  it("ships exactly 94 templates with 36 consolidated endurance protocols", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(94);
    expect([
      EXPANDED_ENDURANCE_BIKE_ACTIVITIES.length,
      EXPANDED_ENDURANCE_RUN_ACTIVITIES.length,
      EXPANDED_ENDURANCE_SWIM_ACTIVITIES.length,
      EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES.length,
      EXPANDED_ENDURANCE_OTHER_ACTIVITIES.length,
      ICONIC_ENDURANCE_ACTIVITIES.length,
    ]).toEqual([7, 5, 9, 5, 5, 5]);
    expect(new Set(SYSTEM_TEMPLATES.map((plan) => plan.id)).size).toBe(94);
    const consolidated = [
      ...EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
      ...EXPANDED_ENDURANCE_RUN_ACTIVITIES,
      ...EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
      ...EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
      ...EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
      ...ICONIC_ENDURANCE_ACTIVITIES,
    ];
    expect(consolidated.filter((plan) => plan.adaptation).length).toBe(36);
    expect(SYSTEM_TEMPLATES.filter((plan) => doseCopyName.test(plan.name))).toEqual([]);
  });

  it("keeps long-repeat and 25-by-400 Norwegian protocols independently identified", () => {
    const norwegian = ICONIC_ENDURANCE_ACTIVITIES.filter((plan) =>
      plan.name.startsWith("Norwegian"),
    );
    expect(norwegian.map((plan) => plan.id)).toEqual([
      "a4e10000-0001-4000-8001-000000000001",
      "a4e20000-0001-4000-8001-000000000005",
      "a4e20000-0001-4000-8004-000000000008",
    ]);
    const shortRepeat = norwegian.find((plan) => plan.name.includes("25×400"));
    const longRepeat = norwegian.find((plan) => plan.name.includes("Long Repeats"));
    expect(shortRepeat?.structure).not.toEqual(longRepeat?.structure);
  });

  it("validates every consolidated plan's bounded semantic adaptation surface", () => {
    const consolidated = [
      ...EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
      ...EXPANDED_ENDURANCE_RUN_ACTIVITIES,
      ...EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
      ...EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
      ...EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
      ...ICONIC_ENDURANCE_ACTIVITIES,
    ];
    const systemPlanById = new Map(SYSTEM_TEMPLATES.map((plan) => [plan.id, plan]));
    for (const sourcePlan of consolidated) {
      const plan = systemPlanById.get(sourcePlan.id ?? "");
      if (!plan) throw new Error(`Missing consolidated system template ${sourcePlan.name}`);
      expect(
        validateActivityPlanAdaptationSurface({
          structure: plan.structure,
          adaptation: plan.adaptation,
          intent: {
            training_intent: plan.training_intent,
          },
        }),
        plan.name,
      ).toMatchObject({ status: "compatible" });
    }
  });
});
