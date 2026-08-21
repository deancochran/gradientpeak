// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$activityPlanId";

const mocks = vi.hoisted(() => ({
  loaderData: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => mocks.loaderData,
  }),
  notFound: vi.fn(),
}));

vi.mock("../../../lib/public-share", () => ({
  loadPublicActivityPlan: vi.fn(),
}));

afterEach(cleanup);

describe("PublicActivityPlanPage", () => {
  it("uses the compiled canonical activity category as its badge and overview value", () => {
    mocks.loaderData = {
      activityPlan: {
        id: "public-plan-1",
        is_system_template: false,
        name: "Tempo run",
        owner: { name: "Avery", username: "avery" },
        activity_category: "run",
        structure_summary: "1 activity step",
        structure_version: 3,
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
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 600,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
          {
            key: "common_load",
            label: "Load",
            status: "unavailable",
            value: null,
            unit: "score",
            reason: "activity_data_missing",
            provenance: null,
          },
          {
            key: "normalized_intensity",
            label: "Intensity",
            status: "unavailable",
            value: null,
            unit: "ratio",
            reason: "activity_data_missing",
            provenance: null,
          },
        ],
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              role: "activity",
              name: "Run",
              notes: "Start controlled.",
              intervals: [
                {
                  name: "Tempo",
                  notes: "Jog the recovery.",
                  repetitions: 1,
                  steps: [
                    {
                      name: "Work",
                      description: "Hold a steady hard effort.",
                      notes: "Stay relaxed.",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "RPE", intensity: 8 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };
    const PublicActivityPlanPage = (Route as unknown as { component: React.ComponentType })
      .component;

    render(<PublicActivityPlanPage />);

    expect(screen.getAllByText("Run").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Categories")).toBeNull();
    expect(screen.queryByRole("button", { name: /print|save as pdf/i })).toBeNull();
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Session flow.*normalized and capped.*authored intensity/i }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("activity-plan-session-flow-timeline-bar-0")
        .getAttribute("data-intensity"),
    ).toBe("RPE 8");
    expect(screen.getByText("Activity structure")).toBeTruthy();
    expect(screen.getAllByText(/8 RPE/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getAllByText("Authored")).toHaveLength(1);
    expect(screen.getAllByText("Unavailable")).toHaveLength(3);
    expect(screen.queryByText("Personalized")).toBeNull();
    expect(screen.getAllByText("Start controlled.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jog the recovery.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hold a steady hard effort.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stay relaxed.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/240 W/)).toBeNull();
  });
});
