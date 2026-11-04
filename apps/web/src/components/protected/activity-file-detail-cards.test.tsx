// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityStreamChartsCard, ActivitySwimDetailCards } from "./activity-file-detail-cards";

afterEach(cleanup);

describe("ActivityStreamChartsCard", () => {
  it("renders accessible charts only for streams with enough real samples", () => {
    render(
      <ActivityStreamChartsCard
        records={[
          { timestamp: "2026-01-01T10:00:00Z", heartRate: 145, power: 210, speed: 4 },
          { timestamp: "2026-01-01T10:05:00Z", heartRate: 152, power: 225 },
          { timestamp: "2026-01-01T10:10:00Z", heartRate: 158, power: 240 },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Stream charts" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Heart rate over time" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Power over time" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Speed over time" })).toBeNull();
  });
});

describe("ActivitySwimDetailCards", () => {
  it("presents pool metadata and normalized laps for swim activities", () => {
    render(
      <ActivitySwimDetailCards
        activityCategory="swim"
        laps={[{ messageIndex: 0, totalElapsedTime: 60, totalDistance: 25 }]}
        lengths={[{ lengthType: "active" }]}
        scopeDescription="Showing the first swim segment from this multisport activity."
        summary={{ poolLengthMeters: 25, totalStrokes: 20 }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pool swim detail" })).toBeTruthy();
    expect(
      screen.getAllByText("Showing the first swim segment from this multisport activity."),
    ).toHaveLength(2);
    expect(screen.getByText("25 meters")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Laps" })).toBeTruthy();
    expect(screen.getByText("1:00")).toBeTruthy();
  });

  it("does not render pool-only detail for a non-swim activity", () => {
    render(<ActivitySwimDetailCards activityCategory="run" />);
    expect(screen.queryByRole("heading", { name: "Pool swim detail" })).toBeNull();
  });
});
