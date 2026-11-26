// @vitest-environment jsdom

import type { CalendarDayVisualState } from "@repo/core/calendar";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarDayVisual } from "./CalendarDayVisual";

describe("CalendarDayVisual", () => {
  it("renders the date and exposes the combined plan and completion story", () => {
    const { container } = render(
      <CalendarDayVisual
        day={18}
        state={{
          sessionCount: 2,
          otherItemCount: 1,
          counts: {
            planned: 0,
            completedAsPlanned: 1,
            completedWithoutPlan: 0,
            partiallyCompleted: 1,
            missed: 1,
            cancelled: 0,
          },
          completedLoad: { depth: "three_quarters", coverage: "partial", value: 96 },
          intensity: { family: "high", coverage: "available", source: "completed" },
          treatment: "partial",
          adherence: "partial",
          signal: { kind: "completed_with_unaccounted_plan", loadDepth: "three_quarters" },
        }}
      />,
    );

    const visual = screen.getByRole("img");
    expect(visual.getAttribute("data-load-depth")).toBe("three_quarters");
    expect(visual.getAttribute("data-signal")).toBe("completed_with_unaccounted_plan");
    expect(container.querySelector('[data-signal="completed-with-unaccounted-plan"]')).toBeTruthy();
    expect(container.querySelector('[data-signal-half="completed"]')).toBeTruthy();
    expect(container.querySelector('[data-signal-half="planned"]')).toBeTruthy();
    expect(visual.getAttribute("aria-label")).toMatch(/1 partially completed.*1 missed/i);
    expect(screen.getByText("18")).toBeTruthy();
    expect(container.querySelectorAll("[data-rhythm]")).toHaveLength(0);
  });

  it.each([
    ["rest", null],
    ["planned", "planned"],
    ["completed", "completed"],
    ["goal", "goal"],
  ] as const)("renders the %s signal without adding another status vocabulary", (kind, mark) => {
    const state: CalendarDayVisualState = {
      sessionCount: 0,
      otherItemCount: 0,
      counts: {
        planned: 0,
        completedAsPlanned: 0,
        completedWithoutPlan: 0,
        partiallyCompleted: 0,
        missed: 0,
        cancelled: 0,
      },
      completedLoad: { depth: "none", coverage: "none", value: null },
      intensity: { family: "none", coverage: "none", source: "none" },
      treatment: "none",
      adherence: "none",
      signal: { kind, loadDepth: kind === "goal" ? "none" : "half" },
    };

    const { container } = render(<CalendarDayVisual day={7} state={state} />);
    const view = within(container);

    expect(view.getByText("7")).toBeTruthy();
    expect(view.getByRole("img").getAttribute("data-signal")).toBe(kind);
    if (mark) expect(container.querySelector(`[data-signal="${mark}"]`)).toBeTruthy();
    else expect(container.querySelector("[data-signal] [data-signal]")).toBeNull();
  });
});
