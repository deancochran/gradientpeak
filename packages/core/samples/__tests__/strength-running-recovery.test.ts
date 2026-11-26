import { describe, expect, it } from "vitest";
import { SYSTEM_TEMPLATES } from "..";
import { EXPANDED_ENDURANCE_RUN_ACTIVITIES } from "../endurance-expansion-run";
import { EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES } from "../endurance-expansion-strength";
import { SYSTEM_LOWER_BODY_STRENGTH, SYSTEM_UPPER_BODY_STRENGTH } from "../indoor-strength";

function steps(name: string) {
  const template = SYSTEM_TEMPLATES.find((candidate) => candidate.name === name);
  if (!template) throw new Error(`Missing template: ${name}`);
  return template.structure.items.flatMap((item) => (item.type === "repeat" ? item.steps : [item]));
}

describe("strength and running recovery prescriptions", () => {
  it("keeps authored and effective fixed prescriptions synchronized", () => {
    for (const authored of [
      ...EXPANDED_ENDURANCE_STRENGTH_ACTIVITIES,
      ...EXPANDED_ENDURANCE_RUN_ACTIVITIES,
      SYSTEM_UPPER_BODY_STRENGTH,
      SYSTEM_LOWER_BODY_STRENGTH,
    ]) {
      const summarize = (structure: typeof authored.structure) =>
        structure.items.map((item) => ({
          count: item.type === "repeat" ? item.count : 1,
          steps: (item.type === "repeat" ? item.steps : [item]).map(
            ({ name, duration, targets }) => ({ name, duration, targets }),
          ),
        }));
      const effective = SYSTEM_TEMPLATES.find((template) => template.id === authored.id);
      if (!effective) throw new Error(`Missing effective template ${authored.name}`);
      expect(summarize(effective.structure), authored.name).toEqual(summarize(authored.structure));
    }
  });
  it.each([
    ["Upper Body Strength", [120, 120, 120]],
    ["Lower Body Strength", [180, 120, 120]],
    ["Compound Strength", [180, 180]],
    ["Power Production", [180, 180]],
  ] as const)("provides passive set recovery in %s", (name, seconds) => {
    const rests = steps(name).filter((step) => step.targets[0]?.type === "rest");
    expect(rests.map((step) => step.duration)).toEqual(
      seconds.map((value) => ({ type: "time", seconds: value })),
    );
    rests.forEach((step) => {
      expect(step.targets).toEqual([{ type: "rest" }]);
    });
  });

  it("aligns heavy set RPE with reps in reserve and keeps power work away from failure", () => {
    const compound = steps("Compound Strength").filter(
      (step) => step.duration.type === "repetitions",
    );
    expect(compound).toHaveLength(2);
    compound.forEach((step) => {
      expect(step.targets).toEqual([{ type: "RPE", intensity: 8 }]);
      expect(step.instructions).toContain("two clean reps in reserve");
    });
    expect(
      steps("Lower Body Strength").find((step) => step.name === "Back Squats")?.targets,
    ).toEqual([{ type: "RPE", intensity: 8 }]);
    steps("Power Production")
      .filter((step) => step.duration.type === "repetitions")
      .forEach((step) => {
        expect(step.targets).toEqual([{ type: "RPE", intensity: 6 }]);
      });
  });

  it.each([
    ["Cruise Tempo Run", 170, "Jog very easily"],
    ["Anaerobic Hill Surges", 125, "Walk or jog gently downhill"],
    ["Neuromuscular Strides", 90, "Walk or jog very easily"],
  ] as const)("preserves active recovery and its timing in %s", (name, seconds, cue) => {
    const recovery = steps(name).find((step) => step.name === "Recovery");
    expect(recovery).toMatchObject({
      duration: { type: "time", seconds },
      targets: [{ type: "RPE", intensity: 2 }],
    });
    expect(recovery?.instructions).toContain(cue);
  });

  it("does not turn foundational movement or control sessions into failure training", () => {
    for (const name of [
      "Movement Capacity Strength",
      "Single-Leg Control",
      "Trunk and Carry Strength",
    ]) {
      for (const step of steps(name).filter((step) => step.duration.type === "repetitions")) {
        expect(step.targets).toEqual([
          expect.objectContaining({ type: "RPE", intensity: expect.any(Number) }),
        ]);
        const target = step.targets[0];
        expect(target?.type === "RPE" && target.intensity <= 6).toBe(true);
      }
    }
  });
});
