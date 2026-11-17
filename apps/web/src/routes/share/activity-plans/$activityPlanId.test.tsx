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
        structure_version: 4,
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
            key: "objective_intensity",
            label: "Intensity",
            status: "unavailable",
            value: null,
            unit: "ratio",
            reason: "activity_data_missing",
            provenance: null,
          },
        ],
        structure: {
          version: 5,
          activity_category: "run",
          items: [
            {
              type: "step",
              id: "00000000-0000-4000-8000-000000000002",
              name: "Work",
              instructions:
                "Start controlled. Jog the recovery. Hold a steady hard effort. Stay relaxed.",
              duration: { type: "time", seconds: 600 },
              targets: [{ type: "RPE", intensity: 8 }],
            },
          ],
        },
      },
    };
    const PublicActivityPlanPage = (
      Route as unknown as {
        component: React.ComponentType;
      }
    ).component;
    render(<PublicActivityPlanPage />);
    expect(screen.getAllByText("Run").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Categories")).toBeNull();
    expect(screen.queryByRole("button", { name: /print|save as pdf/i })).toBeNull();
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(
      screen.getByRole("figure", {
        name: /Session flow with 1 work step.*normalized and capped.*authored intensity/i,
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("activity-plan-session-flow-timeline-bar-0")
        .getAttribute("data-intensity"),
    ).toBe("RPE 8");
    expect(screen.getByText("Session Flow")).toBeTruthy();
    expect(screen.getAllByText(/8 RPE/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getByLabelText("Duration, 10m, Authored")).toBeTruthy();
    expect(screen.queryByLabelText("Distance, Unavailable, Unavailable")).toBeNull();
    expect(screen.getByText("Estimate details")).toBeTruthy();
    expect(screen.queryByText("Personalized")).toBeNull();
    expect(
      screen.getAllByText(
        "Start controlled. Jog the recovery. Hold a steady hard effort. Stay relaxed.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/240 W/)).toBeNull();
  });
});
