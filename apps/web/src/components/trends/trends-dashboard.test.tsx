// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CommonLoadUnavailable,
  getTrendDistanceDisplay,
  getTrendSpeedDisplay,
  TrendReadModelFailure,
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

    expect(screen.getByText("Long-term Load unavailable")).toBeTruthy();
    expect(screen.getByText(/activity history is incomplete/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry Load history" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("preferred-unit trend presentation", () => {
  it("converts canonical distance and speed for imperial viewers", () => {
    expect(getTrendDistanceDisplay(10_000, "metric")).toEqual({ label: "km", value: 10 });
    expect(getTrendDistanceDisplay(10_000, "imperial")).toMatchObject({ label: "mi" });
    expect(getTrendDistanceDisplay(10_000, "imperial").value).toBeCloseTo(6.21, 2);
    expect(getTrendSpeedDisplay(10, "metric")).toEqual({ label: "km/h", value: 36 });
    expect(getTrendSpeedDisplay(10, "imperial")).toMatchObject({ label: "mph" });
    expect(getTrendSpeedDisplay(10, "imperial").value).toBeCloseTo(22.37, 2);
  });
});

describe("TrendReadModelFailure", () => {
  it("offers one retry for the canonical athlete read model", () => {
    const onRetry = vi.fn();
    render(<TrendReadModelFailure isRetrying={false} onRetry={onRetry} />);

    expect(screen.getByText("Analytics are unavailable")).toBeTruthy();
    expect(screen.getByText(/athlete read model could not be loaded/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry analytics" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
