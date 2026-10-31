import type { ActivityPlanItem } from "@repo/core";
import { describe, expect, it } from "vitest";
import { findRepeatForStep } from "./activityPlanSelection";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("activity plan item selection", () => {
  it("resolves a step in a later authored repeat", () => {
    const items: ActivityPlanItem[] = [
      {
        type: "step",
        id: id(1),
        name: "Warm up",
        duration: { type: "time", seconds: 30 },
        targets: [],
      },
      {
        type: "repeat",
        id: id(3),
        count: 2,
        steps: [
          {
            type: "step",
            id: id(4),
            name: "Run",
            duration: { type: "time", seconds: 30 },
            targets: [{ type: "RPE", intensity: 4 }],
          },
        ],
      },
    ];
    expect(findRepeatForStep(items, id(4))?.id).toBe(id(3));
    expect(findRepeatForStep(items, id(1))).toBeUndefined();
  });
});
