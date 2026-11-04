// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$routeId";

const mocks = vi.hoisted(() => ({ loaderData: undefined as unknown }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => mocks.loaderData,
  }),
  notFound: vi.fn(),
}));
vi.mock("../../../lib/public-share", () => ({ loadPublicRoute: vi.fn() }));

afterEach(cleanup);

describe("PublicRoutePage", () => {
  it("renders only the public route DTO's display fields", () => {
    mocks.loaderData = {
      route: {
        id: "public-route-1",
        name: "Ridge Loop",
        description: "A scenic climb.",
        totalDistanceMeters: 5020,
        totalAscentMeters: 120,
        totalDescentMeters: 120,
        polyline: "encoded-public-geometry",
        isSystemTemplate: false,
        owner: { name: "Avery", username: "avery" },
      },
    };
    const PublicRoutePage = (Route as unknown as { component: React.ComponentType }).component;

    render(<PublicRoutePage />);

    expect(screen.getByRole("heading", { name: "Ridge Loop" })).toBeTruthy();
    expect(screen.getByText("Shared by Avery")).toBeTruthy();
    expect(screen.getByText("5.0 km")).toBeTruthy();
    expect(screen.getAllByText("120 m")).toHaveLength(2);
    expect(screen.queryByText("encoded-public-geometry")).toBeNull();
  });
});
