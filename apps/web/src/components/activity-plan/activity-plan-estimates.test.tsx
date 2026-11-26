// @vitest-environment jsdom

import type { SemanticMetric } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanEstimateRow, getActivityPlanEstimateItems } from "./activity-plan-estimates";

afterEach(cleanup);

describe("ActivityPlanEstimateRow", () => {
  it("keeps canonical headline estimates ordered, complete, and immutable", () => {
    const metrics: SemanticMetric[] = [
      {
        key: "objective_intensity",
        label: "Intensity",
        status: "available",
        value: 0,
        unit: "ratio",
        reason: null,
        provenance: "estimated",
      },
      {
        key: "distance",
        label: "Distance",
        status: "available",
        value: 800,
        unit: "meters",
        reason: null,
        provenance: "authored",
      },
      {
        key: "average_power",
        label: "Power",
        status: "available",
        value: 240,
        unit: "watts",
        reason: null,
        provenance: "estimated",
      },
      {
        key: "common_load",
        label: "Load",
        status: "partial",
        value: 25,
        unit: "score",
        reason: "incomplete_members",
        provenance: "estimated",
      },
      {
        key: "elapsed_duration",
        label: "Duration",
        status: "available",
        value: 0,
        unit: "seconds",
        reason: null,
        provenance: null,
      },
      {
        key: "common_load",
        label: "Load",
        status: "available",
        value: 12.34,
        unit: "score",
        reason: null,
        provenance: "personalized",
      },
      // The last duplicate still wins; this malformed legacy zero retains the
      // old zero fallback instead of becoming a placeholder.
      {
        key: "distance",
        label: "Distance",
        status: "available",
        value: 0,
        unit: "legacy",
        reason: null,
        provenance: "estimated",
      },
    ];
    const original = structuredClone(metrics);

    expect(getActivityPlanEstimateItems(metrics)).toEqual([
      { key: "distance", label: "Distance", provenanceLabel: "Estimated", value: "0 m" },
      { key: "elapsed_duration", label: "Duration", provenanceLabel: "Unavailable", value: "0s" },
      { key: "common_load", label: "Load", provenanceLabel: "Personalized", value: "—" },
      {
        key: "objective_intensity",
        label: "Intensity",
        provenanceLabel: "Estimated",
        value: "~0.00",
      },
    ]);
    expect(metrics).toEqual(original);
  });

  it("renders ordered estimate labels, primary tones, and unavailable details", () => {
    render(
      <ActivityPlanEstimateRow
        metrics={[
          {
            key: "common_load",
            label: "Load",
            status: "available",
            value: 0,
            unit: "score",
            reason: null,
            provenance: "authored",
          },
          {
            key: "distance",
            label: "Distance",
            status: "unavailable",
            value: null,
            unit: "meters",
            reason: "source_missing",
            provenance: null,
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "available",
            value: 0,
            unit: "ratio",
            reason: null,
            provenance: "estimated",
          },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-label"))
        .filter(Boolean),
    ).toEqual(["Load, 0, Authored", "Intensity, ~0.00, Estimated"]);
    expect(screen.getByText("0").className).toContain("text-primary");
    expect(screen.getByText("~0.00").className).toContain("text-primary");
    expect(screen.getByText("Estimate details")).toBeTruthy();
    expect(screen.getByText("Distance: source missing")).toBeTruthy();
  });

  it("keeps unavailable estimate reasons visible without an interactive disclosure inside a card", () => {
    const metrics: SemanticMetric[] = [
      {
        key: "elapsed_duration",
        label: "Duration",
        status: "unavailable",
        value: null,
        unit: "seconds",
        reason: "source_missing",
        provenance: null,
      },
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason: "no_load_data",
        provenance: null,
      },
    ];
    render(<ActivityPlanEstimateRow compact metrics={metrics} showUnavailableDetails={false} />);

    expect(screen.getByText(/Unavailable estimates/).textContent).toContain(
      "Duration: source missing",
    );
    expect(screen.getByText(/Unavailable estimates/).textContent).toContain("Load: no load data");
    expect(screen.queryByText(/source_missing|no_load_data/)).toBeNull();
    expect(screen.queryByText("Estimate details")).toBeNull();
    expect(screen.queryByTestId("activity-plan-estimates")).toBeNull();
  });

  it("renders available zero estimates in the shared wrapping metric row", () => {
    render(
      <ActivityPlanEstimateRow
        compact
        metrics={[
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 0,
            unit: "seconds",
            reason: null,
            provenance: "estimated",
          },
        ]}
        showUnavailableDetails={false}
      />,
    );
    expect(screen.getByTestId("activity-plan-estimates").className).toContain("flex");
    expect(screen.getByText("~0s")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Duration, ~0s, Estimated" })).toBeTruthy();
    expect(screen.queryByText(/Unavailable estimates/)).toBeNull();
  });
});
