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
        is_system_template: false,
        name: "Tempo run",
        owner: { name: "Avery", username: "avery" },
        activity_category: "run",
        structure_summary: "1 activity step",
        structure_version: 3,
      },
    };
    const PublicActivityPlanPage = (Route as unknown as { component: React.ComponentType })
      .component;

    render(<PublicActivityPlanPage />);

    expect(screen.getAllByText("Run")).toHaveLength(2);
    expect(screen.queryByText("Categories")).toBeNull();
    expect(screen.queryByRole("button", { name: /print|save as pdf/i })).toBeNull();
  });
});
