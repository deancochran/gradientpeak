import { describe, expect, it } from "vitest";
import { activityPlanStructureSchemaV3 } from "../activity-plan";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";

const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const singleBike = activityPlanStructureSchemaV3.parse({
  version: 3,
  segments: [
    {
      role: "activity",
      id: id(1),
      name: "Bike",
      category: "bike",
      intervals: [
        {
          id: id(2),
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Steady",
              duration: { type: "time", seconds: 3600 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      ],
    },
  ],
});

describe("estimateActivityPlanForTrainingContext", () => {
  it("preserves the exact single-segment cycling calculation as a golden", () => {
    expect(estimateActivityPlanForTrainingContext({ structure: singleBike })).toMatchObject({
      durationSeconds: 3600,
      activeSeconds: 3600,
      restSeconds: 0,
      transitionSeconds: 0,
      intensityFactor: 0.8,
      tss: 64,
      categoryDoses: [
        { category: "bike", intensityFactor: 0.8, tss: 64, evidence: "cycling_power" },
      ],
      confidence: "high",
    });
  });

  it("keeps multisport dose separate and abstains where evidence is unsupported", () => {
    const structure = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        ...singleBike.segments,
        { role: "transition", id: id(4), name: "T1", duration: { type: "time", seconds: 120 } },
        {
          role: "activity",
          id: id(5),
          name: "Run",
          category: "run",
          intervals: [
            {
              id: id(6),
              name: "Run",
              repetitions: 1,
              steps: [
                {
                  id: id(7),
                  name: "5k",
                  duration: { type: "distance", meters: 5000 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const estimate = estimateActivityPlanForTrainingContext({ structure });
    expect(estimate.durationSeconds).toBeNull();
    expect(estimate.transitionSeconds).toBe(120);
    expect(estimate.tss).toBeNull();
    expect(estimate.categoryDoses).toEqual([
      expect.objectContaining({ category: "bike", tss: 64 }),
      expect.objectContaining({ category: "run", tss: null, evidence: "unsupported" }),
    ]);
  });

  it("does not report complete high-confidence load from partial cycling-power evidence", () => {
    const structure = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        {
          role: "activity",
          id: id(20),
          name: "Bike",
          category: "bike",
          intervals: [
            {
              id: id(21),
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: id(22),
                  name: "Power",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
                {
                  id: id(23),
                  name: "RPE",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(estimateActivityPlanForTrainingContext({ structure })).toMatchObject({
      tss: null,
      intensityFactor: null,
      confidence: "medium",
      categoryDoses: [
        {
          category: "bike",
          evidence: "partial_cycling_power",
          evidenceCoverage: 0.5,
          tss: null,
          intensityFactor: null,
        },
      ],
    });
  });
});
