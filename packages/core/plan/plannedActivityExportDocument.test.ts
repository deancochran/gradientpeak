import { describe, expect, it } from "vitest";
import { activityPlanStructureSchemaV3 } from "../activity-plan";
import { getPlannedActivityExportCompatibility } from "./plannedActivityExportCompatibility";
import {
  mapActivityPlanToPlannedActivityExportDocument,
  plannedActivityExportDocumentSchema,
} from "./plannedActivityExportDocument";

const id = (value: number) => `40000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const singleActivityCategory = activityPlanStructureSchemaV3.parse({
  version: 3,
  segments: [
    {
      role: "activity",
      id: id(1),
      name: "Bike",
      activity_category: "bike",
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
    { role: "rest", id: id(4), name: "Rest", duration: { type: "time", seconds: 30 } },
  ],
});

describe("planned activity export document", () => {
  it("losslessly enumerates single-activity-category activity and rest segments", () => {
    const document = mapActivityPlanToPlannedActivityExportDocument({
      event: { id: "event-1", name: "Bike" },
      structure: singleActivityCategory,
      anchors: { ftpWatts: 240 },
    });
    expect(document.segments?.map((segment) => segment.kind)).toEqual(["activity", "rest"]);
    expect(plannedActivityExportDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("reports unsupported rest boundaries for providers that cannot preserve them", () => {
    expect(
      getPlannedActivityExportCompatibility({ structure: singleActivityCategory }),
    ).toMatchObject({
      compatible: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ reasonCode: "unsupported_boundary" }),
      ]),
    });
  });

  it("preserves deterministic single-segment output and normalized target units", () => {
    const single = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [singleActivityCategory.segments[0]],
    });
    const input = {
      event: { id: "event-2", name: "Bike" },
      structure: single,
      anchors: { ftpWatts: 240 },
    };
    const first = mapActivityPlanToPlannedActivityExportDocument(input);
    expect(first).toEqual(mapActivityPlanToPlannedActivityExportDocument(input));
    expect(first.blocks[0]?.steps[0]?.targets).toEqual([
      expect.objectContaining({ metric: "power", resolvedValue: 180, resolvedUnit: "watts" }),
      expect.objectContaining({ metric: "cadence", value: 90 }),
    ]);
  });
});
