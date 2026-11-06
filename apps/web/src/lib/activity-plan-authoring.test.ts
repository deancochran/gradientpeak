import { resolveActivityPlanDraft } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import {
  createActivityPlanRepeat,
  createActivityPlanStep,
  createActivityPlanStructure,
  insertDraftItem,
  moveDraftItem,
} from "./activity-plan-authoring";

describe("activity-plan authoring helpers", () => {
  it("creates an intentionally unresolved blank V5 draft without fake prescription defaults", () => {
    expect(createActivityPlanStructure()).toEqual({
      version: 5,
      activity_category: null,
      items: [],
    });
    expect(createActivityPlanStep()).toEqual(
      expect.objectContaining({ type: "step", duration: null, targets: [] }),
    );
    expect(resolveActivityPlanDraft(createActivityPlanStructure()).status).toBe("invalid");
  });

  it("uses Core operations to insert and move root steps and repeats", () => {
    const first = createActivityPlanStep();
    const repeat = createActivityPlanRepeat();
    const initial = insertDraftItem(createActivityPlanStructure(), first, { index: 0 });
    const inserted = insertDraftItem(initial, repeat, { index: 1 });
    expect(moveDraftItem(inserted, repeat.id, { index: 0 }).items.map((item) => item.id)).toEqual([
      repeat.id,
      first.id,
    ]);
  });
});
