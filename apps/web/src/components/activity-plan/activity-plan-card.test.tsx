// @vitest-environment jsdom

import type { ActivityPlanSummary } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPlanCard } from "./activity-plan-card";

vi.mock("../app-href-link", () => ({
  AppHrefLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

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

    expect(screen.getByText(/Unavailable estimates/).textContent).toContain(
      "Distance: not prescribed",
    );
    expect(screen.queryByText(/not_prescribed/)).toBeNull();
  });

  it("keeps the focus treatment on the actual link and prevents disabled link navigation", () => {
    const plan = {
      id: "plan-focus",
      name: "Focused plan",
      description: null,
      structure: {},
      activityCategory: "run",
      isSystemTemplate: true,
      owner: null,
      engagement: { likes: 0, viewerHasLiked: false },
      metrics: [],
    } as unknown as ActivityPlanSummary;

    const { rerender } = render(<ActivityPlanCard href="/activity-plans/plan-focus" plan={plan} />);
    const link = screen.getByRole("link", { name: "Open activity plan Focused plan" });
    expect(link.className).toContain("focus-visible:ring-2");

    rerender(<ActivityPlanCard disabled href="/activity-plans/plan-focus" plan={plan} />);
    expect(screen.queryByRole("link", { name: "Open activity plan Focused plan" })).toBeNull();
    expect(screen.getByTestId("activity-plan-card-plan-focus").className).toContain("opacity-60");
  });
});
