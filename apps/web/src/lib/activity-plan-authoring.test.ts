import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";

import {
  applyActivityPlanActivityCategory,
  createActivityPlanInterval,
  createActivityPlanSegment,
  createActivityPlanStructure,
  hasIncompatibleTargets,
  moveActivityPlanItem,
  updateActivityStep,
} from "./activity-plan-authoring";

describe("activity plan authoring", () => {
  it("builds structures accepted by the portable Core contract", () => {
    expect(activityPlanStructureSchema.safeParse(createActivityPlanStructure("bike")).success).toBe(
      true,
    );
  });

  it("creates additional activity segments with the plan activity category and permits rest", () => {
    const structure = createActivityPlanStructure("run");
    structure.segments.push(createActivityPlanSegment("rest"));
    structure.segments.push(createActivityPlanSegment("activity"));
    expect(activityPlanStructureSchema.parse(structure).segments.map((item) => item.role)).toEqual([
      "activity",
      "rest",
      "activity",
    ]);
  });

  it("preserves every target and quantity on activity_category change", () => {
    const structure = createActivityPlanStructure("run");
    const segment = structure.segments[0];
    if (!segment || segment.role !== "activity") throw new Error("missing activity segment");
    const interval = segment.intervals[0];
    const step = interval?.steps[0];
    if (!interval || !step) throw new Error("missing activity step");
    interval.steps.splice(0, 1, {
      ...step,
      targets: [{ type: "speed", intensity: 3 }],
    });

    expect(hasIncompatibleTargets(structure, "bike")).toBe(true);
    expect(applyActivityPlanActivityCategory(structure, "bike")).toMatchObject({
      activity_category: "bike",
      segments: [{ intervals: [{ steps: [{ targets: [{ type: "speed", intensity: 3 }] }] }] }],
    });
    expect(applyActivityPlanActivityCategory(structure, "strength").segments).toEqual(
      structure.segments,
    );
  });

  it("immutably updates nested step content", () => {
    const structure = createActivityPlanStructure();
    const segment = structure.segments[0];
    if (!segment || segment.role !== "activity") throw new Error("missing activity segment");
    const interval = segment.intervals[0] ?? createActivityPlanInterval();
    const step = interval.steps[0];
    if (!step) throw new Error("missing step");

    const updated = updateActivityStep(structure, interval.id, step.id, (item) => ({
      ...item,
      name: "Threshold repeat",
    }));
    expect(updated).not.toBe(structure);
    expect(
      updated.segments[0]?.role === "activity"
        ? updated.segments[0].intervals[0]?.steps[0]?.name
        : null,
    ).toBe("Threshold repeat");
    expect(step.name).toBe("Steady effort");
  });

  it("moves items only within bounds", () => {
    expect(moveActivityPlanItem(["warmup", "work", "cooldown"], 1, -1)).toEqual([
      "work",
      "warmup",
      "cooldown",
    ]);
    expect(moveActivityPlanItem(["warmup"], 0, -1)).toEqual(["warmup"]);
  });
});
