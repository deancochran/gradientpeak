import { describe, expect, it } from "vitest";
import { deriveActivityPlanPresentation } from "../presentation";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

function structureWithTargets(
  targets: Array<{ intensity: number; type: "%FTP" | "RPE" | "cadence" | "watts" }>,
) {
  return {
    version: 3,
    segments: [
      {
        id: id(1),
        role: "activity",
        category: "bike",
        name: "Work",
        intervals: [
          {
            id: id(2),
            name: "Build",
            repetitions: 1,
            steps: targets.map((target, index) => ({
              id: id(index + 3),
              name: `Step ${index + 1}`,
              duration: { type: "time", seconds: 60 },
              targets: [target],
            })),
          },
        ],
      },
    ],
  };
}

describe("deriveActivityPlanPresentation", () => {
  it("normalizes RPE and threshold percentages to a common unit interval", () => {
    const rpe = deriveActivityPlanPresentation(
      structureWithTargets([
        { type: "RPE", intensity: 3 },
        { type: "RPE", intensity: 8 },
      ]),
    );
    const threshold = deriveActivityPlanPresentation(
      structureWithTargets([
        { type: "%FTP", intensity: 75 },
        { type: "%FTP", intensity: 110 },
      ]),
    );

    expect(rpe?.occurrences.map((occurrence) => occurrence.normalizedIntensity)).toEqual([
      0.3, 0.8,
    ]);
    expect(threshold?.occurrences.map((occurrence) => occurrence.normalizedIntensity)).toEqual([
      0.75, 1,
    ]);
  });

  it("uses plan-relative scaling for absolute targets without inventing an athlete threshold", () => {
    const model = deriveActivityPlanPresentation(
      structureWithTargets([
        { type: "watts", intensity: 100 },
        { type: "watts", intensity: 300 },
      ]),
    );

    expect(model?.occurrences.map((occurrence) => occurrence.normalizedIntensity)).toEqual([
      0.2, 1,
    ]);
    expect(model?.occurrences[0]?.intensityBasis).toBe("relative_within_plan");
    expect(model?.occurrences[1]?.intensityLabel).toBe("watts 300");
  });

  it("does not compare absolute targets across different sports", () => {
    const model = deriveActivityPlanPresentation({
      version: 3,
      segments: [
        {
          id: id(20),
          role: "activity",
          category: "run",
          name: "Run",
          intervals: [
            {
              id: id(21),
              name: "Run work",
              repetitions: 1,
              steps: [
                {
                  id: id(22),
                  name: "Run power",
                  duration: { type: "time", seconds: 60 },
                  targets: [{ type: "bpm", intensity: 190 }],
                },
              ],
            },
          ],
        },
        {
          id: id(23),
          role: "transition",
          name: "Change sport",
          duration: { type: "time", seconds: 60 },
        },
        {
          id: id(24),
          role: "activity",
          category: "bike",
          name: "Bike",
          intervals: [
            {
              id: id(25),
              name: "Bike work",
              repetitions: 1,
              steps: [
                {
                  id: id(26),
                  name: "Bike power",
                  duration: { type: "time", seconds: 60 },
                  targets: [{ type: "bpm", intensity: 140 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(model?.occurrences[0]?.normalizedIntensity).toBeCloseTo(0.6);
    expect(model?.occurrences[1]?.normalizedIntensity).toBeNull();
    expect(model?.occurrences[2]?.normalizedIntensity).toBeCloseTo(0.6);
  });

  it("does not represent cadence alone as exercise intensity", () => {
    const model = deriveActivityPlanPresentation(
      structureWithTargets([{ type: "cadence", intensity: 90 }]),
    );

    expect(model?.occurrences[0]).toMatchObject({
      intensityBasis: "unavailable",
      intensityLabel: null,
      normalizedIntensity: null,
    });
  });

  it("returns null for invalid structures", () => {
    expect(deriveActivityPlanPresentation({ version: 3, segments: [] })).toBeNull();
  });
});
