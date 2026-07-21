// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getFailedTrendSources,
  retryFailedTrendQueries,
  TrendPartialFailure,
} from "./trends-dashboard";

describe("getFailedTrendSources", () => {
  it("returns only independently failed analytics sources", () => {
    expect(
      getFailedTrendSources([
        { isError: false, name: "Volume" },
        { isError: true, name: "Training load" },
        { isError: false, name: "Consistency" },
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
