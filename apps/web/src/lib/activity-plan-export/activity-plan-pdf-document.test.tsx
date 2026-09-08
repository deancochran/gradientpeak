import { pdf } from "@react-pdf/renderer";
import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { ActivityPlanPdfDocument } from "./activity-plan-pdf-document";

const model: ActivityPlanPrintModel = {
  activityCategory: "bike",
  description: null,
  format: "bike-cue-strip",
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
  it("renders a real PDF blob in the browser renderer", async () => {
    const blob = await pdf(<ActivityPlanPdfDocument model={model} />).toBlob();
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
  });
});
