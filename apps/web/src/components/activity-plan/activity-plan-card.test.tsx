// @vitest-environment jsdom

import type { ActivityPlanSummary } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanCard } from "./activity-plan-card";

afterEach(cleanup);

const objectiveIntensity = {
  key: "objective_intensity" as const,
  label: "Intensity",
  status: "available" as const,
  value: 2_439 / 3_500,
  unit: "ratio",
  reason: null,
  provenance: "estimated" as const,
};

describe("ActivityPlanCard", () => {
  it("uses only the canonical objective intensity metric", () => {
    const plan = {
      id: "plan-range",
      name: "Easy Swim",
      description: null,
      structure: {},
      activityCategory: "swim",
      isSystemTemplate: true,
      owner: null,
      engagement: { likes: 0, viewerHasLiked: false },
      metrics: [
        {
          key: "normalized_intensity",
          label: "Normalized intensity",
          status: "partial",
          value: 0.55,
          unit: "ratio",
          reason: "incomplete_members",
        },
        objectiveIntensity,
      ],
    } as unknown as ActivityPlanSummary;

    render(<ActivityPlanCard plan={plan} />);

    expect(screen.getByText("~0.70")).toBeTruthy();
    expect(screen.queryByText("0.55")).toBeNull();
  });

  it("keeps compact unavailable-estimate feedback human-readable", () => {
    const plan = {
      id: "plan-unavailable-distance",
      name: "Open ride",
      description: null,
      structure: {},
      activityCategory: "bike",
      isSystemTemplate: true,
      owner: null,
      engagement: { likes: 0, viewerHasLiked: false },
      metrics: [
        {
          key: "distance",
          label: "Distance",
          status: "unavailable",
          value: null,
          unit: "meters",
          reason: "not_prescribed",
          provenance: null,
        },
      ],
    } as unknown as ActivityPlanSummary;

    render(<ActivityPlanCard plan={plan} />);

    expect(screen.getByText("Some estimates are unavailable.")).toBeTruthy();
    expect(screen.queryByText(/not_prescribed/)).toBeNull();
  });
});
