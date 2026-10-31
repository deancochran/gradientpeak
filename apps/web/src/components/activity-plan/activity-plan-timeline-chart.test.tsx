// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

afterEach(cleanup);
const structure = {
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Sprint",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "RPE", intensity: 10 }],
    },
  ],
};
describe("ActivityPlanTimelineChart", () => {
  it("keeps maximum-intensity bars at the full chart height without vertical padding clipping", () => {
    render(<ActivityPlanTimelineChart height={112} structure={structure} />);
    const chart = screen.getByTestId("activity-plan-timeline");
    expect(
      screen.getByRole("figure", { name: /activity prescription timeline with 1 work step/i }),
    ).toBe(chart);
    expect(chart.className).not.toContain("p-2");
    expect(chart.getAttribute("aria-label")).toMatch(/widths are normalized and capped/i);
    expect(screen.getByTestId("activity-plan-timeline-bar-0").style.height).toBe("112px");
  });
  it("exposes authored work bars as keyboard-accessible selection controls when editing", () => {
    const onOccurrenceSelect = vi.fn();
    render(
      <ActivityPlanTimelineChart onOccurrenceSelect={onOccurrenceSelect} structure={structure} />,
    );
    const bar = screen.getByRole("button", { name: /edit rpe 10, 60 seconds/i });
    expect(
      screen
        .getByRole("figure", { name: /activity prescription timeline with 1 work step/i })
        .contains(bar),
    ).toBe(true);
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bar);
    expect(onOccurrenceSelect).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "00000000-0000-4000-8000-000000000003" }),
    );
  });
});
