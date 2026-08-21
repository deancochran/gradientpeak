// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

const structure = {
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Work",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Hard effort",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              name: "Sprint",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "RPE", intensity: 10 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("ActivityPlanTimelineChart", () => {
  it("keeps maximum-intensity bars at the full chart height without vertical padding clipping", () => {
    render(<ActivityPlanTimelineChart height={112} structure={structure} />);

    const chart = screen.getByTestId("activity-plan-timeline");
    expect(chart.className).not.toContain("p-2");
    expect(chart.getAttribute("aria-label")).toMatch(/widths are normalized and capped/i);
    expect(screen.getByTestId("activity-plan-timeline-bar-0").style.height).toBe("112px");
  });
});
