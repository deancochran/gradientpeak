// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CommonLoadUnavailable,
  getFailedTrendSources,
  retryFailedTrendQueries,
  TrendPartialFailure,
} from "./trends-dashboard";

describe("CommonLoadUnavailable", () => {
  it("explains intentional abstention and provides a retry", () => {
    const onRetry = vi.fn();
    render(
      <CommonLoadUnavailable
        isRetrying={false}
        onRetry={onRetry}
        reason="incomplete_observation"
      />,
    );

    expect(screen.getByText("Long-term unavailable")).toBeTruthy();
    expect(screen.getByText(/activity history is incomplete/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry Load history" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("getFailedTrendSources", () => {
  it("returns only independently failed analytics sources", () => {
    expect(
      getFailedTrendSources([
        { isError: false, name: "Dashboard" },
        { isError: true, name: "Training load" },
        { isError: false, name: "Dashboard" },
        { isError: true, name: "Peak power" },
      ]),
    ).toEqual(["Training load", "Peak power"]);
  });

  it("retries failed sources without refetching successful analytics", async () => {
    const successfulRefetch = vi.fn(async () => undefined);
    const failedRefetch = vi.fn(async () => undefined);

    await retryFailedTrendQueries([
      { isError: false, refetch: successfulRefetch },
      { isError: true, refetch: failedRefetch },
    ]);

    expect(failedRefetch).toHaveBeenCalledOnce();
    expect(successfulRefetch).not.toHaveBeenCalled();
  });

  it("keeps successful analytics visible while offering an observable partial-source retry", () => {
    const onRetry = vi.fn();
    render(
      <TrendPartialFailure
        failedSources={["Training load", "Peak power"]}
        isRetrying={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Some analytics are unavailable")).toBeTruthy();
    expect(
      screen.getByText("Showing successful sources. Unavailable: Training load, Peak power."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry unavailable" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
