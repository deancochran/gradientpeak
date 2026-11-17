import { describe, expect, it } from "vitest";
import type { ActivityTarget } from "../../targets";
import {
  activityPlanAuthoringIssueCodes,
  activityPlanAuthoringStructureSchema,
  activityPlanStructureSchema,
  getActivityPlanAuthoringIssues,
} from "..";

const step = (targets: ActivityTarget[]) => ({
  type: "step" as const,
  id: "00000000-0000-4000-8000-000000000001",
  duration: { type: "time" as const, seconds: 60 },
  targets,
});
const plan = (targets: ActivityTarget[], repeated = false) => ({
  version: 5,
  activity_category: targets.some((target) => target.type === "speed") ? "run" : "bike",
  items: repeated
    ? [
        {
          type: "repeat",
          id: "00000000-0000-4000-8000-000000000002",
          count: 2,
          steps: [step(targets)],
        },
      ]
    : [step(targets)],
});
const rpe: ActivityTarget = { type: "RPE", intensity: 6 };
const cadence: ActivityTarget = { type: "cadence", intensity: 90 };
const objectives: ActivityTarget[] = [
  { type: "%FTP", intensity: 70 },
  { type: "watts", intensity: 150 },
  { type: "%MaxHR", intensity: 70 },
  { type: "%ThresholdHR", intensity: 80 },
  { type: "bpm", intensity: 140 },
  { type: "speed", intensity: 20 },
];

describe("RPE authoring exclusivity", () => {
  it.each(
    objectives,
  )("rejects RPE mixed with $type in either order, including repeats", (objective) => {
    for (const repeated of [false, true]) {
      for (const targets of [
        [rpe, objective],
        [objective, rpe],
        [rpe, cadence, objective],
      ]) {
        const input = plan(targets, repeated);
        // Existing records remain readable; validation never silently drops a target.
        const historical = activityPlanStructureSchema.parse(input);
        expect(historical.items).toEqual(input.items);
        expect(activityPlanAuthoringStructureSchema.safeParse(input).success).toBe(false);
        expect(getActivityPlanAuthoringIssues(historical)).toContainEqual({
          code: activityPlanAuthoringIssueCodes.rpeMixedWithIntensity,
          path: repeated ? ["items", 0, "steps", 0, "targets"] : ["items", 0, "targets"],
          message: expect.stringContaining("RPE cannot be combined"),
        });
      }
    }
  });

  it.each([
    [rpe],
    [rpe, cadence],
    [cadence, rpe],
    [],
    [{ type: "rest" }],
  ] satisfies ActivityTarget[][])("allows valid targets %j", (...targets) => {
    expect(activityPlanAuthoringStructureSchema.safeParse(plan(targets)).success).toBe(true);
  });

  it("preserves an objective intensity with supplemental cadence", () => {
    expect(
      activityPlanAuthoringStructureSchema.safeParse(
        plan([{ type: "%FTP", intensity: 70 }, cadence]),
      ).success,
    ).toBe(true);
  });

  it("still rejects RPE with passive rest", () => {
    expect(
      activityPlanAuthoringStructureSchema.safeParse(plan([rpe, { type: "rest" }])).success,
    ).toBe(false);
  });
});
