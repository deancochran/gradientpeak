import { describe, expect, it } from "vitest";
import {
  buildActivityPlanPrintModel,
  getActivityPlanBikeCueLength,
  getActivityPlanPrintFormats,
} from "./print";

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
  it("offers a full activity plan to every category and the swim-specific card to swim plans", () => {
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
    expect(model?.intensityProfile).toHaveLength(4);
    expect(model?.intensityProfile[0]).toMatchObject({
      duration: "100 m",
      heightPercent: 77,
      label: "7 RPE",
      role: "activity",
      weight: 1,
    });
    expect(model?.sections[0]?.groups[0]).toMatchObject({
      name: null,
      repetitions: 4,
      steps: [{ instruction: "100 m at 7 RPE", name: "Freestyle" }],
    });
  });

  it("removes labels already represented by the plan or adjacent content", () => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      personalizeTargets: false,
      structure: {
        ...swimStructure,
        segments: [
          {
            ...swimStructure.segments[0],
            name: "Swim activity",
            intervals: [
              {
                ...swimStructure.segments[0].intervals[0],
                name: "Freestyle",
              },
            ],
          },
        ],
      },
      title: "Threshold 100s",
    });

    expect(model?.sections[0]?.name).toBeNull();
    expect(model?.sections[0]?.groups[0]).toMatchObject({
      name: null,
      steps: [{ name: "Freestyle" }],
    });
  });

  it("rejects a category-specific format for the wrong category", () => {
    expect(
      buildActivityPlanPrintModel({
        format: "bike-cue-strip",
        personalizeTargets: false,
        structure: swimStructure,
        title: "Threshold 100s",
      }),
    ).toBeNull();
  });

  it("selects a five-inch bike strip for five steps and seven inches for six", () => {
    const step = {
      description: null,
      id: id(10),
      instruction: "1m at 7 RPE",
      name: "Work",
      notes: null,
    };
    const modelWithStepCount = (count: number) => ({
      sections: [
        {
          groups: [
            {
              id: id(11),
              name: null,
              notes: null,
              repetitions: 1,
              steps: Array.from({ length: count }, (_, index) => ({
                ...step,
                id: id(20 + index),
              })),
            },
          ],
          id: id(12),
          name: null,
          notes: null,
        },
      ],
    });

    expect(getActivityPlanBikeCueLength(modelWithStepCount(5))).toBe("short");
    expect(getActivityPlanBikeCueLength(modelWithStepCount(6))).toBe("long");
  });
});
