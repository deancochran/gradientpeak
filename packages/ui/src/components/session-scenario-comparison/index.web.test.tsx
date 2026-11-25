import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sessionScenarioComparisonFixtures } from "./fixtures";
import { SessionScenarioComparison } from "./index.web";

afterEach(cleanup);

describe("SessionScenarioComparison web", () => {
  it("renders all baseline and alternative metrics with non-color source distinctions", () => {
    render(<SessionScenarioComparison {...sessionScenarioComparisonFixtures.aligned} />);

    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Baseline and alternative training-load projections shown over the same planning horizon.",
    );
    expect(screen.getByText("Nov 23")).toBeTruthy();
    expect(screen.getByText("Nov 24")).toBeTruthy();
    expect(screen.getByText("training load")).toBeTruthy();
    expect(screen.getByLabelText("Training-state legend")).toHaveTextContent(
      "● Baseline · solid□ Alternative · dashed",
    );
    for (const metric of ["Fitness", "Fatigue", "Form"]) {
      expect(screen.getByLabelText("Chart legend")).toHaveTextContent(`${metric} · Baseline`);
      expect(screen.getByLabelText("Chart legend")).toHaveTextContent(`${metric} · Alternative`);
    }
    expect(document.querySelectorAll("polyline")).toHaveLength(6);
    expect(document.querySelectorAll('polyline[stroke-dasharray="6 4"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-marker="circle-filled"]')).toHaveLength(6);
    expect(document.querySelectorAll('[data-marker="square-outline"]')).toHaveLength(6);
  });

  it("places a singleton alternative at its actual date across an irregular horizon", () => {
    const state = { longTermLoad: 42, recentLoad: 57, loadBalance: -15 };
    render(
      <SessionScenarioComparison
        baseline={{
          transitions: ["2026-11-23", "2026-11-25", "2026-11-30"].map((date) => ({
            toAsOf: `${date}T00:00:00.000Z`,
            state,
          })),
        }}
        alternative={{ transitions: [{ toAsOf: "2026-11-30T00:00:00.000Z", state }] }}
        timeZone="UTC"
      />,
    );

    const position = (date: string) => {
      const marker = document.querySelector<HTMLElement>(
        `[data-source="recorded"][data-date="${date}"]`,
      );
      expect(marker).not.toBeNull();
      return Number.parseFloat(marker?.style.left ?? "");
    };
    const first = position("2026-11-23");
    const middle = position("2026-11-25");
    const last = position("2026-11-30");
    expect((middle - first) / (last - first)).toBeCloseTo(2 / 7);
    expect(
      document.querySelectorAll('[data-source="projected"][data-date="2026-11-30"]'),
    ).toHaveLength(3);
    expect(
      document.querySelectorAll('[data-source="projected"]:not([data-date="2026-11-30"])'),
    ).toHaveLength(0);
  });

  it("keeps an empty comparison unavailable without fabricating a plot", () => {
    render(
      <SessionScenarioComparison
        alternative={{ transitions: [] }}
        baseline={{ transitions: [] }}
        emptyMessage="No supported comparison"
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("No supported comparison")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelectorAll("polyline")).toHaveLength(0);
  });
});
