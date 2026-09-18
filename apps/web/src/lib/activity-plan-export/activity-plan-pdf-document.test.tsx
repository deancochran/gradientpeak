import { pdf } from "@react-pdf/renderer";
import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { ActivityPlanPdfDocument, getActivityPlanPdfPageSize } from "./activity-plan-pdf-document";

const model: ActivityPlanPrintModel = {
  activityCategory: "bike",
  description: null,
  format: "bike-cue-strip",
  intensityProfile: [
    {
      color: "#f59e0b",
      duration: "2m",
      heightPercent: 82,
      id: "profile-1",
      label: "95% FTP",
      role: "activity",
      weight: 2,
    },
  ],
  intensityReferences: ["240 W"],
  notes: null,
  sections: [
    {
      groups: [
        {
          id: "group-1",
          name: null,
          notes: null,
          repetitions: 4,
          steps: [
            {
              description: null,
              id: "step-1",
              instruction: "2m at 240 W",
              name: "Over",
              notes: null,
            },
          ],
        },
      ],
      id: "section-1",
      name: "Main set",
      notes: null,
    },
  ],
  title: "FTP over-unders",
  totals: ["1h"],
};

describe("activity plan PDF document", () => {
  it("uses a landscape 5 by 3 inch page for swim deck cards", () => {
    expect(
      getActivityPlanPdfPageSize({ ...model, activityCategory: "swim", format: "swim-deck-card" }),
    ).toEqual([360, 216]);
  });

  it("uses five-inch and seven-inch cue strips for short and long bike activity plans", () => {
    const firstStep = model.sections[0]?.groups[0]?.steps[0];
    if (!firstStep) throw new Error("Expected bike cue fixture step");
    expect(getActivityPlanPdfPageSize(model)).toEqual([162, 360]);
    expect(
      getActivityPlanPdfPageSize({
        ...model,
        sections: model.sections.map((section) => ({
          ...section,
          groups: section.groups.map((group) => ({
            ...group,
            steps: Array.from({ length: 6 }, (_, index) => ({
              ...firstStep,
              id: `step-${index}`,
            })),
          })),
        })),
      }),
    ).toEqual([162, 504]);
  });

  it("renders a real PDF blob in the browser renderer", async () => {
    const blob = await pdf(<ActivityPlanPdfDocument model={model} />).toBlob();
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
  });
});
