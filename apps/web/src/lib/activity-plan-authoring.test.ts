import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";

import {
  createActivityPlanInterval,
  createActivityPlanSegment,
  createActivityPlanStructure,
  moveActivityPlanItem,
  updateActivityStep,
} from "./activity-plan-authoring";

describe("activity plan authoring", () => {
  it("builds structures accepted by the portable Core V3 contract", () => {
    expect(
      activityPlanStructureSchemaV3.safeParse(createActivityPlanStructure("bike")).success,
    ).toBe(true);
  });

  it("supports multisport structure without a web-only workout model", () => {
    const structure = createActivityPlanStructure("run");
    structure.segments.push(createActivityPlanSegment("transition"));
    structure.segments.push(createActivityPlanSegment("activity", "bike"));
    expect(
      activityPlanStructureSchemaV3.parse(structure).segments.map((item) => item.role),
    ).toEqual(["activity", "transition", "activity"]);
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
