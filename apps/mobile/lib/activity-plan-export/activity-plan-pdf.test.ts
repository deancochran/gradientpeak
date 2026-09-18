import type { ActivityPlanPrintModel } from "@repo/core/activity-plan";
import { describe, expect, it } from "vitest";
import { renderActivityPlanPrintHtml } from "./activity-plan-pdf";

const model: ActivityPlanPrintModel = {
  activityCategory: "swim",
  description: "Pool threshold session",
  format: "swim-deck-card",
  intensityProfile: [
    {
      color: "#0891b2",
      duration: "100 m",
      heightPercent: 77,
      id: "profile-1",
      label: "7 RPE",
      role: "activity",
      weight: 1,
    },
  ],
  intensityReferences: ["7 RPE"],
  notes: "Bring a pace clock card",
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
    expect(html).toContain("size: 360px 216px");
    expect(html).toContain("padding: 6px 10px 8px");
    expect(html).toContain('class="swim-deck"');
    expect(html).toContain("grid-template-columns: 25% 31% 44%");
    expect(html).toContain("Threshold &amp; speed");
    expect(html).toContain('href="https://gradientpeak.app"');
    expect(html).toContain('viewBox="0 0 1024 1024"');
    expect(html).toContain("Repeat 4×");
    expect(html).not.toContain("Intensity reference");
    expect(html).not.toContain(">Intensity profile");
    expect(html).toContain("7 RPE · 100 m");
    expect(html).toContain("height:77%");
    expect(html).toContain("single-profile");
    expect(html).toContain("-webkit-print-color-adjust: exact");
    expect(html).toContain("Use the pace clock");
    expect(html).toContain("Leave from the wall together");
    expect(html).toContain("Bring a pace clock card");
  });

  it("uses concise five-inch bike cues and a seven-inch fallback for longer activity plans", () => {
    const profileBar = model.intensityProfile[0];
    const firstStep = model.sections[0]?.groups[0]?.steps[0];
    if (!profileBar || !firstStep) throw new Error("Expected compact PDF fixture data");
    const bikeModel: ActivityPlanPrintModel = {
      ...model,
      activityCategory: "bike",
      format: "bike-cue-strip",
      intensityProfile: [profileBar, { ...profileBar, id: "profile-2" }],
      sections: model.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({
          ...group,
          steps: group.steps.map((step) => ({ ...step, notes: "Hide this bike cue note" })),
        })),
      })),
    };
    const shortHtml = renderActivityPlanPrintHtml(bikeModel);
    expect(shortHtml).toContain("size: 162px 360px");
    expect(shortHtml).toContain("GRADIENTPEAK");
    expect(shortHtml).toContain("100 m at 7 RPE");
    expect(shortHtml).not.toContain("2 blocks");
    expect(shortHtml).not.toContain("Use the pace clock");
    expect(shortHtml).not.toContain("Leave from the wall together");
    expect(shortHtml).not.toContain("Hide this bike cue note");
    expect(shortHtml).not.toContain("Bring a pace clock card");

    const longHtml = renderActivityPlanPrintHtml({
      ...bikeModel,
      sections: bikeModel.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({
          ...group,
          steps: Array.from({ length: 6 }, (_, index) => ({
            ...firstStep,
            id: `step-${index}`,
          })),
        })),
      })),
    });
    expect(longHtml).toContain("size: 162px 504px");
  });
});
