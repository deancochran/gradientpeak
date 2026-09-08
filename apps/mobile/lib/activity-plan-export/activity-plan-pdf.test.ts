import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { renderActivityPlanPrintHtml } from "./activity-plan-pdf";

const model: ActivityPlanPrintModel = {
  activityCategory: "swim",
  description: "Pool threshold session",
  format: "swim-deck-card",
  intensityReferences: ["7 RPE"],
  notes: null,
  sections: [
    {
      groups: [
        {
          id: "group-1",
          name: null,
          notes: "Leave from the wall together",
          repetitions: 4,
          steps: [
            {
              description: null,
              id: "step-1",
              instruction: "100 m at 7 RPE",
              name: "Freestyle",
              notes: null,
            },
          ],
        },
      ],
      id: "section-1",
      name: "Main set",
      notes: "Use the pace clock",
    },
  ],
  title: "Threshold & speed",
  totals: ["400 m"],
};

describe("mobile activity plan PDF HTML", () => {
  it("uses the swim card dimensions and escapes plan content", () => {
    const html = renderActivityPlanPrintHtml(model);
    expect(html).toContain("size: 288px 432px");
    expect(html).toContain("Threshold &amp; speed");
    expect(html).toContain("Repeat 4×");
    expect(html).toContain("Intensity reference");
    expect(html).toContain("Use the pace clock");
    expect(html).toContain("Leave from the wall together");
  });
});
