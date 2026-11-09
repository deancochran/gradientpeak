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
    expect(screen.getByRole("img", { name: /Historical Fitness/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Historical Fatigue/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Historical Form.*-10.0/ })).toBeTruthy();
    expect(screen.getByLabelText("Recent training load").className).toContain("dark");
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

  it("marks an establishing historical baseline without changing its recorded series", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: {
            loadHistory: {
              ...availableHistory,
              result: { ...availableHistory.result, maturity: { status: "establishing_baseline" } },
            },
          },
        }}
      />,
    );

    expect(screen.getByText(/Modeled baseline is still being established/)).toBeTruthy();
    expect(screen.getByRole("cell", { name: "0.0" })).toBeTruthy();
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
    expect(screen.getByText("Published training state")).toBeTruthy();
    expect(screen.getByText("Published performance estimates")).toBeTruthy();
  });

  it("does not call stale, partial published baseline values current", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: {
            metricsAvailable: true,
            publishedState: {
              publishedAt: "2026-08-20T12:00:00.000Z",
              baseline: { longTermLoad: 31.2, recentLoad: 42.8, loadBalance: -11.6 },
              estimates: [],
            },
            status: {
              asOf: "2026-08-24T12:00:00.000Z",
              freshness: "stale",
              importStatus: "partial",
              coverage: {
                startAt: "2026-06-01T00:00:00.000Z",
                endAt: "2026-08-22T23:59:59.999Z",
                lastActivityAt: "2026-08-22T12:00:00.000Z",
              },
            },
          },
        }}
      />,
    );

    const publishedCard = screen.getByTestId("published-training-state");
    expect(publishedCard.textContent).toContain("Freshness: stale");
    expect(publishedCard.textContent).toContain("Import: partial");
    expect(publishedCard.textContent).toContain(
      "This published state is stale and the import is partial",
    );
    expect(publishedCard.textContent).toContain("Published");
    expect(screen.queryByRole("heading", { name: "Current training state" })).toBeNull();
    expect(screen.getByText(/Read model as of:/)).toBeTruthy();
    expect(screen.getByText(/Coverage:/)).toBeTruthy();
  });

  it("labels an unknown published baseline as unknown rather than stale", () => {
    render(
      <CoachAthleteOverview
        athleteId="athlete-a"
        result={{
          status: "granted",
          model: {
            metricsAvailable: true,
            publishedState: {
              publishedAt: "2026-08-20T12:00:00.000Z",
              baseline: { longTermLoad: 31.2, recentLoad: 42.8, loadBalance: -11.6 },
              estimates: [],
            },
          },
        }}
      />,
    );

    const publishedCard = screen.getByTestId("published-training-state");
    expect(publishedCard.textContent).toContain("Freshness: unknown");
    expect(publishedCard.textContent).toContain("Freshness is unknown");
    expect(publishedCard.textContent).not.toContain("stale");
    expect(screen.queryByRole("heading", { name: "Current training state" })).toBeNull();
  });

  it("removes private history when the selected identity is unavailable", () => {
    render(<CoachAthleteOverview athleteId="athlete-b" result={{ status: "unavailable" }} />);

    expect(screen.getByRole("heading", { name: "Athlete workspace unavailable" })).toBeTruthy();
    expect(screen.queryByText("0.0")).toBeNull();
  });
});
