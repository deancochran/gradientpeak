// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrescriptionQuantificationBundleFixture } from "../../test-support/activity-quantification";

import {
  formatPlannedDayActivityCategories,
  PlannedDaySummary,
  type WebPlannedDaySummaryData,
} from "./planned-day-summary";

function aggregateQuantification(load: number | null) {
  return createPrescriptionQuantificationBundleFixture([
    {
      activityCategory: "bike",
      durationSeconds: 2_700,
      id: "plan-1",
      load: load === null ? null : load / 2,
    },
    {
      activityCategory: "run",
      durationSeconds: 2_700,
      id: "plan-2",
      load: load === null ? null : load / 2,
    },
  ]);
}

const completeData: WebPlannedDaySummaryData = {
  summary: {
    eventCount: 2,
    activity_categories: ["bike", "run"],
    totalDurationSeconds: 5_400,
    prescriptionQuantification: aggregateQuantification(120),
    commonLoad: aggregateQuantification(120).summary.commonLoad,
  },
  source: {
    complete: true,
    eventCount: 2,
    unavailableEstimateCount: 0,
    unavailablePlanCount: 0,
    unlinkedPlanCount: 0,
  },
};

afterEach(cleanup);

describe("PlannedDaySummary", () => {
  it("shows independent planned Event totals and an unordered unique activity_category mix", () => {
    render(
      <PlannedDaySummary data={completeData} error={false} isLoading={false} onRetry={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Planned workload" })).toBeTruthy();
    expect(screen.getByText("2 Events")).toBeTruthy();
    expect(screen.getByText("Bike + Run")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getByText("0.89")).toBeTruthy();
    expect(
      screen.queryByText(/Brick|Triathlon|combined activity|transition|one session/i),
    ).toBeNull();
  });

  it("keeps repeated activity_categories unique without claiming a sequence", () => {
    expect(formatPlannedDayActivityCategories(["bike", "run", "bike"])).toBe("Bike + Run");
    expect(formatPlannedDayActivityCategories(["bike", "run", "bike"])).not.toContain("→");
  });

  it("makes unknown estimates and partial sources explicit", () => {
    render(
      <PlannedDaySummary
        data={{
          ...completeData,
          summary: {
            ...completeData.summary,
            totalDurationSeconds: null,
            prescriptionQuantification: aggregateQuantification(null),
            commonLoad: aggregateQuantification(null).summary.commonLoad,
          },
          source: {
            ...completeData.source,
            unavailableEstimateCount: 1,
            unavailablePlanCount: 1,
            unlinkedPlanCount: 1,
          },
        }}
        error={false}
        isLoading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status").textContent).toContain("Partial information");
  });

  it("keeps loading, error with retry, and empty states distinct", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <PlannedDaySummary error={false} isLoading={true} onRetry={onRetry} />,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading planned workload");

    rerender(<PlannedDaySummary error isLoading={false} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry planned workload" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <PlannedDaySummary
        data={{
          ...completeData,
          summary: {
            ...completeData.summary,
            eventCount: 0,
            activity_categories: [],
            totalDurationSeconds: 0,
            prescriptionQuantification: aggregateQuantification(null),
            commonLoad: aggregateQuantification(null).summary.commonLoad,
          },
          source: { ...completeData.source, eventCount: 0 },
        }}
        error={false}
        isLoading={false}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("No planned Events for this day.")).toBeTruthy();
  });

  it("announces retry progress and restores focus to the stable heading after recovery", async () => {
    let resolveRetry: () => void = () => undefined;
    const retry = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    const { rerender } = render(
      <PlannedDaySummary error isLoading={false} onRetry={() => retry} />,
    );
    const heading = screen.getByRole("heading", { name: "Planned workload" });

    expect(heading.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByRole("button", { name: "Retry planned workload" }));
    expect(screen.getByRole("status").textContent).toContain("Retrying planned workload");

    await act(async () => {
      resolveRetry();
      await retry;
    });
    rerender(
      <PlannedDaySummary data={completeData} error={false} isLoading={false} onRetry={vi.fn()} />,
    );

    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("status").textContent).toContain("retry finished");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("contains retry rejection, keeps the error state, and restores heading focus", async () => {
    const retry = Promise.reject(new Error("network unavailable"));
    render(<PlannedDaySummary error isLoading={false} onRetry={() => retry} />);
    const heading = screen.getByRole("heading", { name: "Planned workload" });

    fireEvent.click(screen.getByRole("button", { name: "Retry planned workload" }));

    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.getByRole("status").textContent).toContain("retry failed");
  });
});
