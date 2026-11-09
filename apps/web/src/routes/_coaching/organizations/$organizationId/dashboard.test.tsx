// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  organizationId: "organization-1",
  actorProfileId: "actor-1",
  pathname: "/organizations/organization-1/dashboard",
  overview: {
    status: "granted" as const,
    overview: {
      activeStaff: 3,
      activeEngagements: 24,
      pausedEngagements: 2,
      activeEngagementsWithoutPrimary: 4,
    },
  } as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => ({
      overview: state.overview,
      organizationId: "organization-1",
      actorProfileId: "actor-1",
    }),
    useParams: () => ({ organizationId: state.organizationId }),
    useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
  }),
  useRouterState: () => state.pathname,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { Route } from "./dashboard";

afterEach(() => {
  cleanup();
  state.organizationId = "organization-1";
  state.actorProfileId = "actor-1";
  state.pathname = "/organizations/organization-1/dashboard";
  state.overview = {
    status: "granted",
    overview: {
      activeStaff: 3,
      activeEngagements: 24,
      pausedEngagements: 2,
      activeEngagementsWithoutPrimary: 4,
    },
  };
});

describe("coach dashboard", () => {
  it.each([
    "path",
    "organization",
    "actor",
  ])("does not show prior counts when %s changes", (change) => {
    if (change === "path") state.pathname = "/organizations/organization-2/dashboard";
    if (change === "organization") {
      state.organizationId = "organization-2";
      state.pathname = "/organizations/organization-2/dashboard";
    }
    if (change === "actor") state.actorProfileId = "actor-2";
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("status").textContent).toContain("Loading organization overview");
    expect(screen.queryByRole("heading", { name: "Organization management" })).toBeNull();
  });
  it("shows exact operational counts without implying private athlete data access", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Organization management" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage coach assignments" })).toBeTruthy();
    expect(
      screen.getByText(/does not grant access to private athlete training, health, or messages/),
    ).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "View matching records" })).toHaveLength(4);
    expect(
      screen.getByText(/Timed coverage and plan-horizon signals are not available/),
    ).toBeTruthy();
  });

  it("renders an explicit access-lost state instead of organization data", () => {
    state.overview = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
    expect(screen.queryByText("Casey Coach")).toBeNull();
  });
});
