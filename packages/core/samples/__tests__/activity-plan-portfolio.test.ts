import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../../activity-plan";
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

describe("fixed system activity catalog", () => {
  it("keeps cadence endurance structure stable while adding its scalar cadence target", () => {
    const cadencePlan = SYSTEM_TEMPLATES.find(
      (plan) => plan.id === "b1c00000-0008-4000-8001-000000000029",
    );
    expect(cadencePlan?.structure.items).toEqual([
      expect.objectContaining({
        type: "step",
        name: "Warmup",
        duration: { type: "time", seconds: 660 },
        targets: [{ type: "%FTP", intensity: 55 }],
      }),
      expect.objectContaining({
        type: "repeat",
        count: 4,
        steps: [
          expect.objectContaining({
            name: "Work",
            duration: { type: "time", seconds: 480 },
            targets: [
              { type: "%FTP", intensity: 70 },
              { type: "cadence", intensity: 90 },
            ],
            instructions: expect.not.stringMatching(/\d+\s*(?:–|-|to)\s*\d+\s*rpm/i),
          }),
          expect.objectContaining({
            name: "Recovery",
            duration: { type: "time", seconds: 180 },
            targets: [{ type: "%FTP", intensity: 50 }],
          }),
        ],
      }),
      expect.objectContaining({
        type: "step",
        name: "Cooldown",
        duration: { type: "time", seconds: 540 },
        targets: [{ type: "%FTP", intensity: 50 }],
      }),
    ]);
  });

  it("keeps active swim guidance actionable and modality-specific", () => {
    const swimPlans = SYSTEM_TEMPLATES.filter(
      (plan) => plan.structure.activity_category === "swim",
    );
    const instructions = swimPlans.flatMap((plan) =>
      plan.structure.items.flatMap((item) =>
        (item.type === "repeat" ? item.steps : [item]).map((step) => step.instructions ?? ""),
      ),
    );
    expect(instructions.join("\n")).not.toMatch(
      /drills as needed|include drill work|keep it interesting/i,
    );

    const requiredPlan = (name: string) => {
      const plan = swimPlans.find((candidate) => candidate.name === name);
      if (!plan) throw new Error(`Missing swim template ${name}`);
      return plan;
    };
    const requiredStep = (planName: string, stepName: string) => {
      const step = requiredPlan(planName).structure.items.find(
        (item) => item.type === "step" && item.name === stepName,
      );
      if (!step || step.type !== "step") {
        throw new Error(`Missing ${stepName} in swim template ${planName}`);
      }
      return step;
    };

    expect(requiredStep("Threshold Set", "Warm-up").instructions).toContain("catch-up drill");
    expect(requiredStep("Endurance Set", "Variable Pace").instructions).toContain("descending");
    expect(requiredStep("Critical Swim Speed (CSS)", "Warmup").instructions).toContain(
      "Swim easy freestyle",
    );
  });

  it("ships 68 templates with 33 consolidated endurance protocols and three reference assessments", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    expect([
      EXPANDED_ENDURANCE_BIKE_ACTIVITIES.length,
      EXPANDED_ENDURANCE_RUN_ACTIVITIES.length,
      EXPANDED_ENDURANCE_SWIM_ACTIVITIES.length,
      EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES.length,
      EXPANDED_ENDURANCE_OTHER_ACTIVITIES.length,
      ICONIC_ENDURANCE_ACTIVITIES.length,
    ]).toEqual([5, 3, 9, 5, 2, 4]);
    expect(new Set(SYSTEM_TEMPLATES.map((plan) => plan.id)).size).toBe(68);
    expect(SYSTEM_TEMPLATES).not.toContainEqual(
      expect.objectContaining({
        id: "a4e30000-0001-4000-8001-000000000009",
        name: "Rønnestad 30/15 Cycling",
      }),
    );
    expect(SYSTEM_TEMPLATES).not.toContainEqual(
      expect.objectContaining({
        id: "8d5e1b64-9b22-4f74-a5e2-5cf05d85cc50",
        name: "Option 1 (My favorite – 4,400 m)",
      }),
    );
    const consolidated = [
      ...EXPANDED_ENDURANCE_BIKE_ACTIVITIES,
      ...EXPANDED_ENDURANCE_RUN_ACTIVITIES,
      ...EXPANDED_ENDURANCE_SWIM_ACTIVITIES,
      ...EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
      ...EXPANDED_ENDURANCE_OTHER_ACTIVITIES,
      ...ICONIC_ENDURANCE_ACTIVITIES,
    ];
    expect(consolidated.every((plan) => !("adaptation" in plan))).toBe(true);
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

  it("validates every consolidated plan as fixed V4 content", () => {
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
      expect(activityPlanStructureSchema.safeParse(plan.structure).success, plan.name).toBe(true);
    }
  });
});
