import { describe, expect, it } from "vitest";
import { buildActivityPlanPrintModel, getActivityPlanPrintFormats } from "./print";

const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const swimStructure = {
  version: 3,
  activity_category: "swim",
  segments: [
    {
      id: id(1),
      name: "Main set",
      role: "activity",
      intervals: [
        {
          id: id(2),
          name: "Interval 1",
          repetitions: 4,
          steps: [
            {
              id: id(3),
              name: "Freestyle",
              duration: { type: "distance", meters: 100 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
} as const;

describe("activity plan print model", () => {
  it("offers a full workout to every category and the swim-specific card to swim plans", () => {
    expect(getActivityPlanPrintFormats("run")).toEqual(["full-page"]);
    expect(getActivityPlanPrintFormats("swim")).toEqual(["full-page", "swim-deck-card"]);
    expect(getActivityPlanPrintFormats("bike")).toEqual(["full-page", "bike-cue-strip"]);
  });

  it("builds repeated instructions, totals, and an intensity reference", () => {
    const model = buildActivityPlanPrintModel({
      format: "swim-deck-card",
      personalizeTargets: false,
      structure: swimStructure,
      title: "Threshold 100s",
    });

    expect(model).toMatchObject({
      activityCategory: "swim",
      intensityReferences: ["7 RPE"],
      title: "Threshold 100s",
      totals: ["400 m"],
    });
    expect(model?.sections[0]?.groups[0]).toMatchObject({
      name: null,
      repetitions: 4,
      steps: [{ instruction: "100 m at 7 RPE", name: "Freestyle" }],
    });
  });

  it("rejects a sport-specific format for the wrong category", () => {
    expect(
      buildActivityPlanPrintModel({
        format: "bike-cue-strip",
        personalizeTargets: false,
        structure: swimStructure,
        title: "Threshold 100s",
      }),
    ).toBeNull();
  });
});
