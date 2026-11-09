// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoachAthleteOverview } from "./coach-athlete-overview";

const availableHistory = {
  publishedRevision: 3,
  algorithmVersion: "load-v1",
  result: {
    status: "available" as const,
    identity: {
      planningTimezone: "America/Chicago",
      startDate: "2026-06-01",
      endDate: "2026-08-23",
    },
    maturity: { status: "mature" as const },
    points: [
      {
        date: "2026-08-22",
        dailyLoad: 0,
        longTermLoad: 31.2,
        recentLoad: 21.1,
        loadBalance: -10.1,
      },
      {
        date: "2026-08-23",
        dailyLoad: 18.4,
        longTermLoad: 30.9,
        recentLoad: 20.9,
        loadBalance: -10,
      },
    ],
  },
};

describe("CoachAthleteOverview", () => {
  afterEach(cleanup);

  it("shows a true zero daily load and separates completed load from modeled state and performance", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{ status: "granted", model: { loadHistory: availableHistory } }}
      />,
    );

    expect(screen.getByText("Recent completed daily Common Load")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "0.0" })).toBeTruthy();
    expect(screen.getByText(/Common Load points are derived/)).toBeTruthy();
    expect(screen.getByText(/Dates are planning dates in America\/Chicago/)).toBeTruthy();
    expect(screen.getByRole("table").textContent).toContain("Modeled recent load");
    expect(screen.queryByText("Published load state")).toBeNull();
  });

  it("does not turn unavailable history into zeroes", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: {
            loadHistory: {
              publishedRevision: 3,
              algorithmVersion: "load-v1",
              result: { status: "unavailable", reason: "insufficient_history" },
            },
          },
        }}
      />,
    );

    expect(screen.getByText(/Historical load is unavailable/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders shared activity history without exposing unshared metrics", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: { publishedState: null, loadHistory: availableHistory },
        }}
      />,
    );

    expect(screen.getByText("Recent completed daily Common Load")).toBeTruthy();
    expect(screen.queryByText("Published load state")).toBeNull();
    expect(screen.queryByText("Published performance estimates")).toBeNull();
    expect(screen.queryByText("Projection status")).toBeNull();
  });

  it("retains the empty metrics presentation when metrics access is granted", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: { metricsAvailable: true, publishedState: null, loadHistory: null },
        }}
      />,
    );
    expect(screen.getByText("Published load state")).toBeTruthy();
    expect(screen.getByText("Published performance estimates")).toBeTruthy();
  });

  it("removes private history when the selected identity is unavailable", () => {
    render(<CoachAthleteOverview athleteId="athlete-b" result={{ status: "unavailable" }} />);

    expect(screen.getByRole("heading", { name: "Athlete workspace unavailable" })).toBeTruthy();
    expect(screen.queryByText("0.0")).toBeNull();
  });
});
