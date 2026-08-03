// @vitest-environment jsdom

import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { buildPerformanceOverviewFixture } from "@repo/core/testing/performance-model";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceModelSummary } from "./performance-model-summary";

afterEach(cleanup);

function overviewFixture(): AthletePerformanceOverview {
  const overview = buildPerformanceOverviewFixture();
  return {
    ...overview,
    bike: {
      ...overview.bike,
      fiveSecondPower: {
        status: "partial",
        value: "1,200 W",
        confidence: "low",
        freshness: "current",
        trainingImpact: "Training targets stay unchanged.",
        action: "Record more activity data.",
      },
    },
  };
}

describe("PerformanceModelSummary", () => {
  it("presents available, limited, and unavailable values without internal model copy", () => {
    render(<PerformanceModelSummary overview={overviewFixture()} />);

    expect(screen.getByRole("heading", { name: "Current performance" })).toBeTruthy();
    const threshold = screen.getByRole("article", {
      name: "Bike Planning threshold power: 247 W, Available",
    });
    expect(within(threshold).getByText("High")).toBeTruthy();
    expect(within(threshold).getByText("Current")).toBeTruthy();
    expect(within(threshold).getByText(/sets cycling power zones/i)).toBeTruthy();

    const limited = screen.getByRole("article", {
      name: "Bike Five-second power: 1,200 W, Limited",
    });
    expect(within(limited).getByText("Low")).toBeTruthy();
    expect(within(limited).getByText("Training targets stay unchanged.")).toBeTruthy();
    expect(within(limited).getByText("Record more activity data.")).toBeTruthy();

    const unavailable = screen.getByRole("article", {
      name: "Run Planning threshold pace: Not available, Not available",
    });
    expect(within(unavailable).queryByText("Confidence:")).toBeNull();
    expect(within(unavailable).queryByText("Freshness:")).toBeNull();
    expect(within(unavailable).getByText("Training targets stay unchanged.")).toBeTruthy();
    expect(within(unavailable).getByText("Record more activity data.")).toBeTruthy();

    const css = screen.getByRole("article", {
      name: "Swim CSS pace: Not available, Not available",
    });
    expect(within(css).queryByText("Record more activity data.")).toBeNull();
    expect(screen.getByText("Estimated threshold duration")).toBeTruthy();
    expect(screen.getAllByText("Duration retention")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(
      /canonical|as-of|evidence count|calculation version|reason code|source id|protocol|roadmap|progressive|max-HR/i,
    );
  });

  it("keeps a failed model query distinct and retryable", () => {
    const onRetry = vi.fn();
    render(<PerformanceModelSummary error="Request failed" onRetry={onRetry} />);

    expect(screen.getByText("Current performance could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("Request failed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
