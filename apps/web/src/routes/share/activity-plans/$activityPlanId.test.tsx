// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$activityPlanId";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

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
  describeStructure: () => "1 activity step",
  loadPublicActivityPlan: vi.fn(),
}));

afterEach(cleanup);

describe("PublicActivityPlanPage", () => {
  it("uses the compiled canonical activity category as its badge and overview value", () => {
    mocks.loaderData = {
      activityPlan: {
        is_system_template: false,
        name: "Tempo run",
        owner: { name: "Avery", username: "avery" },
        structure: {
          segments: [
            {
              activity_category: "run",
              id: id(1),
              intervals: [
                {
                  id: id(2),
                  name: "Tempo",
                  repetitions: 1,
                  steps: [
                    {
                      duration: { seconds: 60, type: "time" },
                      id: id(3),
                      name: "Work",
                      targets: [{ intensity: 5, type: "RPE" }],
                    },
                  ],
                },
              ],
              name: "Run",
              role: "activity",
            },
          ],
          version: 3,
        },
      },
    };
    const PublicActivityPlanPage = (Route as unknown as { component: React.ComponentType })
      .component;

    render(<PublicActivityPlanPage />);

    expect(screen.getAllByText("Run")).toHaveLength(2);
    expect(screen.queryByText("Categories")).toBeNull();
  });
});
