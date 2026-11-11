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
    thresholds: {
      ...overview.thresholds,
      run: {
        status: "unavailable",
        value: null,
        confidence: "unavailable",
        freshness: "unavailable",
        trainingImpact: "Training targets stay unchanged.",
        action: "Record more activity data.",
      },
      swim: {
        ...overview.thresholds.swim,
        freshness: "stale",
        action: "Record more recent activity data.",
      },
    },
  };
}

describe("PerformanceModelSummary", () => {
  it("presents current, stale, and unavailable values without internal model copy", () => {
    render(<PerformanceModelSummary overview={overviewFixture()} />);

    expect(screen.getByRole("heading", { name: "Current performance" })).toBeTruthy();
    const threshold = screen.getByRole("article", {
      name: "Bike Threshold Power: 250 W, Available",
    });
    expect(within(threshold).getByText("High")).toBeTruthy();
    expect(within(threshold).getByText("Current")).toBeTruthy();
    expect(within(threshold).getByText(/sets cycling power zones/i)).toBeTruthy();

    const unavailable = screen.getByRole("article", {
      name: "Run Threshold Pace: Not available, Not available",
    });
    expect(within(unavailable).queryByText("Confidence:")).toBeNull();
    expect(within(unavailable).queryByText("Freshness:")).toBeNull();
    expect(within(unavailable).getByText("Training targets stay unchanged.")).toBeTruthy();
    expect(within(unavailable).getByText("Record more activity data.")).toBeTruthy();

    const swim = screen.getByRole("article", {
      name: "Swim Threshold Pace: 1:20 min/100m, Available",
    });
    expect(within(swim).getByText("Out of date")).toBeTruthy();
    expect(within(swim).getByText("Record more recent activity data.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /canonical|as-of|evidence count|calculation version|reason code|source id|protocol|roadmap|progressive|max-HR/i,
    );
  });

  it("announces asynchronous loading politely and a failed query assertively", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PerformanceModelSummary isLoading />);

    const loading = await screen.findByRole("status");
    expect(loading.textContent).toBe("Loading current performance…");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-atomic")).toBe("true");

    rerender(<PerformanceModelSummary error="Request failed" onRetry={onRetry} />);

    const failure = await screen.findByRole("alert");
    expect(within(failure).getByText("Current performance could not be loaded.")).toBeTruthy();
    expect(failure.getAttribute("aria-live")).toBe("assertive");
    expect(failure.getAttribute("aria-atomic")).toBe("true");
    expect(screen.queryByText("Request failed")).toBeNull();
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
