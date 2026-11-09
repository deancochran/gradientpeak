import { describe, expect, it } from "vitest";
import { activityPlanAuthoringStructureSchema } from "../../activity-plan";
import { SYSTEM_TEMPLATES } from "..";
import { SAMPLE_SPRINT_WORKOUT } from "../indoor-bike-activity";
import { GROUP_RIDE_SIMULATION } from "../outdoor-bike";

describe("athlete-relative catalog sprint targets", () => {
  it.each([
    SAMPLE_SPRINT_WORKOUT,
    GROUP_RIDE_SIMULATION,
  ])("keeps authored and effective $name prescriptions synchronized", (source) => {
    const effective = SYSTEM_TEMPLATES.find((template) => template.id === source.id);
    expect(effective).toBeDefined();
    const summarize = (structure: typeof source.structure) =>
      structure.items
        .flatMap((item) => (item.type === "repeat" ? item.steps : [item]))
        .map(({ name, duration, targets }) => ({ name, duration, targets }));
    expect(effective && summarize(effective.structure)).toEqual(summarize(source.structure));
    expect(activityPlanAuthoringStructureSchema.safeParse(effective?.structure).success).toBe(true);
  });

  it.each([
    ["Sprint Power Development", "Sprint Opener", 10],
    ["Sprint Power Development", "Max Sprint", 15],
    ["Group Ride Simulation", "Sprint Finish", 60],
  ] as const)("uses RPE 10 for %s / %s without changing its duration", (name, stepName, seconds) => {
    const template = SYSTEM_TEMPLATES.find((candidate) => candidate.name === name);
    const steps = template?.structure.items.flatMap((item) =>
      item.type === "repeat" ? item.steps : [item],
    );
    expect(steps?.find((step) => step.name === stepName)).toMatchObject({
      duration: { type: "time", seconds },
      targets: [{ type: "RPE", intensity: 10 }],
    });
  });

  it("does not prescribe absolute athlete-specific watts, heart rate or speed in shared templates", () => {
    for (const template of SYSTEM_TEMPLATES) {
      for (const item of template.structure.items) {
        for (const step of item.type === "repeat" ? item.steps : [item]) {
          expect(
            step.targets.filter((target) => ["watts", "bpm", "speed"].includes(target.type)),
            `${template.name}: ${step.name}`,
          ).toEqual([]);
        }
      }
    }
  });
});
