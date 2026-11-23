import { describe, expect, it } from "vitest";
import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import { buildActivityPlanPrintModel } from "..";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

describe("V5 activity-plan print model", () => {
  it.each([
    false,
    true,
    undefined,
  ])("respects personalization preference %s", (personalizeTargets) => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      ...(personalizeTargets === undefined ? {} : { personalizeTargets }),
      performanceTargets: buildPerformanceTargetFactsFixture({ bikeThresholdWatts: 300 }),
      structure: {
        version: 5,
        activity_category: "bike",
        items: [
          {
            type: "step",
            id: id(10),
            duration: { type: "time", seconds: 60 },
            targets: [{ type: "%FTP", intensity: 80 }],
          },
        ],
      },
      title: "Relative targets",
    });
    const label = personalizeTargets === false ? "80% FTP" : "240 W (80% FTP)";
    expect(model?.sections[0]?.groups[0]?.steps[0]?.targetLabels).toEqual([label]);
    expect(model?.sections[0]?.groups[0]?.steps[0]?.instruction).toBe(`1m at ${label}`);
    expect(model?.intensityReferences).toEqual([label]);
  });

  it("preserves repeated step doses and labels all open-ended subtotals", () => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      structure: {
        version: 5,
        activity_category: "other",
        items: [
          {
            type: "repeat",
            id: id(20),
            count: 3,
            steps: [
              {
                type: "step",
                id: id(21),
                duration: { type: "distance", meters: 400 },
                targets: [],
              },
              {
                type: "step",
                id: id(22),
                duration: { type: "repetitions", count: 8 },
                targets: [],
              },
              { type: "step", id: id(23), duration: { type: "untilFinished" }, targets: [] },
            ],
          },
        ],
      },
      title: "Mixed circuit",
    });
    expect(model?.totals).toEqual([
      "Distance subtotal: 1.2 km",
      "Repetitions subtotal: 24 reps",
      "Plus open-ended work",
    ]);
    expect(model?.sections[0]?.groups[0]?.repetitions).toBe(3);
    expect(model?.sections[0]?.groups[0]?.steps.map((step) => step.durationLabel)).toEqual([
      "400 m",
      "8 reps",
      "Until finished",
    ]);
  });

  it("keeps duration and authored targets structured while preserving the compact instruction", () => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      personalizeTargets: false,
      structure: {
        activity_category: "run",
        items: [
          {
            duration: { seconds: 90, type: "time" },
            id: id(1),
            instructions: "Relax your shoulders.",
            name: "Steady",
            targets: [{ intensity: 6, type: "RPE" }],
            type: "step",
          },
        ],
        version: 5,
      },
      title: "Structured labels",
    });

    const step = model?.sections[0]?.groups[0]?.steps[0];
    expect(step).toMatchObject({
      durationLabel: "1m 30s",
      instruction: "1m 30s at 6 RPE",
      instructions: "Relax your shoulders.",
      targetLabels: ["6 RPE"],
    });
  });

  it("does not invent a target for untargeted or open-ended work and labels totals honestly", () => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      structure: {
        activity_category: "strength",
        items: [
          {
            duration: { seconds: 300, type: "time" },
            id: id(2),
            instructions: "Move with control.",
            name: "Warm up",
            targets: [],
            type: "step",
          },
          {
            duration: { type: "untilFinished" },
            id: id(3),
            instructions: "Finish the mobility circuit.",
            name: "Mobility",
            targets: [],
            type: "step",
          },
        ],
        version: 5,
      },
      title: "Open ended",
    });

    expect(model?.sections[0]?.groups.flatMap((group) => group.steps)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          durationLabel: "Until finished",
          instruction: "Until finished",
          targetLabels: [],
        }),
      ]),
    );
    expect(model?.totals).toEqual(["Timed subtotal: 5m", "Plus open-ended work"]);
  });
});
