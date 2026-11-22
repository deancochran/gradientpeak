// @vitest-environment jsdom

import type { SemanticMetric } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanEstimateRow } from "./activity-plan-estimates";

afterEach(cleanup);

describe("ActivityPlanEstimateRow", () => {
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
      "Duration: source_missing",
    );
    expect(screen.getByText(/Unavailable estimates/).textContent).toContain("Load: no_load_data");
    expect(screen.queryByText("Estimate details")).toBeNull();
    expect(screen.getByTestId("activity-plan-estimates").className).toContain("flex");
  });
});
