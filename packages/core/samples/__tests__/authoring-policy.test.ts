import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../../activity-plan";
import { createSystemActivityPlanBuilder } from "../activity-plan-builder";
import * as sourceExports from "../index";
import { SYSTEM_TEMPLATES } from "../index";

describe("system activity-plan authoring policy", () => {
  it.each(SYSTEM_TEMPLATES)("validates $name as a fixed V5 activity plan", (plan) => {
    const result = activityPlanStructureSchema.safeParse(plan.structure);
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
        structure.version !== 5
      )
        continue;
      const result = activityPlanStructureSchema.safeParse(structure);
      expect(result.error?.issues ?? [], name).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("does not persist deprecated step classification from names", () => {
    const structure = createSystemActivityPlanBuilder("run", "purpose-free")
      .step({
        name: "Recovery",
        duration: { type: "time", seconds: 60 },
        targets: [{ type: "RPE", intensity: 5 }],
      })
      .build();
    expect(structure.items[0]).toMatchObject({ name: "Recovery" });
    expect(structure.items[0]).not.toHaveProperty("purpose");
  });

  it("keeps every active percentage prescription on the explicit five-point grid", () => {
    const percentageTypes = new Set(["%FTP", "%MaxHR", "%ThresholdHR"]);
    const percentageTargets = SYSTEM_TEMPLATES.flatMap((plan) =>
      plan.structure.items.flatMap((item) =>
        (item.type === "repeat" ? item.steps : [item]).flatMap((step) =>
          step.targets
            .filter(
              (target): target is Exclude<typeof target, { type: "rest" }> =>
                target.type !== "rest" && percentageTypes.has(target.type),
            )
            .map((target) => ({ name: plan.name, type: target.type, value: target.intensity })),
        ),
      ),
    );

    expect(percentageTargets).toHaveLength(153);
    expect(percentageTargets.every((target) => target.value % 5 === 0)).toBe(true);
    // This is the complete approved adjustment set. The source builders and
    // executable V5 fixtures agree; durations, repetitions, and non-percent
    // targets are deliberately outside this assertion's scope.
    expect(percentageTargets.filter((target) => target.value === 75)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Progressive Long Endurance Ride", type: "%FTP" }),
      ]),
    );
    expect(percentageTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Outdoor Sweet Spot Intervals", type: "%FTP", value: 90 }),
        expect.objectContaining({ name: "Threshold Power Intervals", type: "%FTP", value: 90 }),
        expect.objectContaining({
          name: "Marathon Pace Long Run",
          type: "%ThresholdHR",
          value: 80,
        }),
        expect.objectContaining({ name: "Track Ladder Activity", type: "%ThresholdHR", value: 85 }),
        expect.objectContaining({ name: "Norwegian 4×4 Run", type: "%MaxHR", value: 90 }),
        expect.objectContaining({ name: "Endurance Set", type: "%ThresholdHR", value: 70 }),
        expect.objectContaining({ name: "CrossFit WOD", type: "%MaxHR", value: 90 }),
      ]),
    );
  });

  it("keeps the audited mobility and strength prescriptions executable and duration-stable", () => {
    const required = (name: string) => {
      const plan = SYSTEM_TEMPLATES.find((candidate) => candidate.name === name);
      if (!plan) throw new Error(`Missing ${name}`);
      return plan;
    };
    const seconds = (name: string) =>
      required(name).structure.items.reduce((total, item) => {
        const steps = item.type === "repeat" ? item.steps : [item];
        const count = item.type === "repeat" ? item.count : 1;
        return (
          total +
          steps.reduce(
            (itemTotal, step) =>
              itemTotal + (step.duration.type === "time" ? step.duration.seconds * count : 0),
            0,
          )
        );
      }, 0);
    const flattenedNames = (name: string) =>
      required(name).structure.items.flatMap((item) =>
        (item.type === "repeat" ? item.steps : [item]).map((step) => step.name),
      );

    expect(seconds("Mobility Reset")).toBe(29 * 60);
    expect(flattenedNames("Mobility Reset")).toEqual([
      "Warmup",
      "Hip circles",
      "Thoracic rotations",
      "Ankle rocks",
      "Shoulder circles",
      "Half-kneeling hip flexor reach",
      "Cat-cow",
      "Cooldown",
    ]);
    expect(seconds("Yoga Balance Flow")).toBe(41 * 60);
    expect(flattenedNames("Yoga Balance Flow")).toEqual([
      "Warmup",
      "Mountain pose",
      "Chair pose",
      "Warrior II",
      "Triangle pose",
      "Tree pose",
      "Seated twist",
      "Cooldown",
    ]);
    expect(seconds("Full Body Circuit")).toBe(50 * 60);
    const circuit = required("Full Body Circuit").structure.items[1];
    expect(circuit).toMatchObject({ type: "repeat", count: 5 });
    expect(circuit?.type === "repeat" ? circuit.steps[0]?.duration : undefined).toEqual({
      type: "time",
      seconds: 360,
    });
    expect(circuit?.type === "repeat" ? circuit.steps[0]?.instructions : undefined).toContain(
      "each station is 45 sec work + 15 sec complete rest",
    );
    expect(circuit?.type === "repeat" ? circuit.steps.at(-1)?.duration : undefined).toEqual({
      type: "time",
      seconds: 120,
    });
    expect(seconds("Core and Stability")).toBe(37 * 60);
    expect(seconds("Functional Movement")).toBe(50 * 60);
  });
});
