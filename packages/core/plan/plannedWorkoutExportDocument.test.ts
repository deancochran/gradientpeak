import { describe, expect, it } from "vitest";
import { activityPlanStructureSchemaV3 } from "../activity-plan";
import { getPlannedWorkoutExportCompatibility } from "./plannedWorkoutExportCompatibility";
import {
  mapActivityPlanToPlannedWorkoutExportDocument,
  plannedWorkoutExportDocumentSchema,
} from "./plannedWorkoutExportDocument";

const id = (value: number) => `40000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const multisport = activityPlanStructureSchemaV3.parse({
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
          name: "Bike set",
          repetitions: 2,
          steps: [
            {
              id: id(3),
              name: "Power",
              duration: { type: "time", seconds: 600 },
              targets: [
                { type: "%FTP", intensity: 75 },
                { type: "cadence", intensity: 90 },
              ],
            },
          ],
        },
      ],
    },
    { role: "transition", id: id(4), name: "T1", duration: { type: "time", seconds: 90 } },
    {
      role: "activity",
      id: id(6),
      name: "Run",
      category: "run",
      intervals: [
        {
          id: id(7),
          name: "Run set",
          repetitions: 1,
          steps: [
            {
              id: id(8),
              name: "Distance",
              duration: { type: "distance", meters: 5000 },
              targets: [{ type: "speed", intensity: 18 }],
            },
            {
              id: id(9),
              name: "Reps",
              duration: { type: "repetitions", count: 8 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
            {
              id: id(10),
              name: "Open",
              duration: { type: "untilFinished" },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
    { role: "rest", id: id(5), name: "Rest", duration: { type: "time", seconds: 30 } },
  ],
});

describe("planned workout export document", () => {
  it("losslessly enumerates activity, transition, rest, and every completion policy", () => {
    const document = mapActivityPlanToPlannedWorkoutExportDocument({
      event: { id: "event-1", name: "Tri" },
      structure: multisport,
      anchors: { ftpWatts: 240 },
    });
    expect(document.segments?.map((segment) => segment.kind)).toEqual([
      "activity",
      "transition",
      "activity",
      "rest",
    ]);
    expect(document.categories).toEqual(["bike", "run"]);
    expect(document.legacyProjection?.lossless).toBe(false);
    const run = document.segments?.[2];
    expect(
      run?.kind === "activity" ? run.blocks[0]?.steps.map((step) => step.duration.kind) : [],
    ).toEqual(["distance", "repetitions", "open"]);
    expect(plannedWorkoutExportDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("rejects provider mappings that would drop boundaries or combine sports", () => {
    expect(getPlannedWorkoutExportCompatibility({ structure: multisport })).toMatchObject({
      compatible: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ reasonCode: "unsupported_boundary" }),
        expect.objectContaining({ reasonCode: "mixed_activity_categories" }),
      ]),
    });
  });

  it("preserves deterministic single-segment output and normalized target units", () => {
    const single = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [multisport.segments[0]],
    });
    const input = {
      event: { id: "event-2", name: "Bike" },
      structure: single,
      anchors: { ftpWatts: 240 },
    };
    const first = mapActivityPlanToPlannedWorkoutExportDocument(input);
    expect(first).toEqual(mapActivityPlanToPlannedWorkoutExportDocument(input));
    expect(first.legacyProjection?.lossless).toBe(true);
    expect(first.blocks[0]?.steps[0]?.targets).toEqual([
      expect.objectContaining({ metric: "power", resolvedValue: 180, resolvedUnit: "watts" }),
      expect.objectContaining({ metric: "cadence", value: 90 }),
    ]);
  });
});
