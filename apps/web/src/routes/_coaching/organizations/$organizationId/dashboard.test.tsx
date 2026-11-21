// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  organizationId: "organization-1",
  actorProfileId: "actor-1",
  pathname: "/organizations/organization-1/dashboard",
  invalidate: vi.fn(),
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
  createFileRoute: () => (options: object) =>
    ({
      ...options,
      useLoaderData: () => ({
        overview: state.overview,
        organizationId: "organization-1",
        actorProfileId: "actor-1",
      }),
      useParams: () => ({ organizationId: state.organizationId }),
      useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
    }) as Record<string, unknown>,
  useRouterState: () => state.pathname,
  useRouter: () => ({ invalidate: state.invalidate }),
  Link: ({
    children,
    to,
    "aria-label": label,
  }: {
    children: ReactNode;
    to: string;
    "aria-label"?: string;
  }) => (
    <a href={to} aria-label={label}>
      {children}
    </a>
  ),
}));

import { Route } from "./dashboard";

afterEach(() => {
  cleanup();
  state.organizationId = "organization-1";
  state.actorProfileId = "actor-1";
  state.pathname = "/organizations/organization-1/dashboard";
  state.invalidate.mockReset();
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
    expect(screen.queryByRole("heading", { name: "Organization overview" })).toBeNull();
  });
  it("shows exact operational counts without implying private athlete data access", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Organization overview" })).toBeTruthy();
    const metrics = screen.getByTestId("organization-overview-metrics");
    expect(metrics.textContent).toContain("Active athletes");
    expect(metrics.textContent).toContain("24");
    expect(metrics.textContent).toContain("Active staff");
    expect(metrics.textContent).toContain("3");
    expect(metrics.textContent).toContain("Unassigned");
    expect(metrics.textContent).toContain("4");
    expect(metrics.textContent).toContain("Coverage gaps");
    expect(metrics.textContent).toContain("Unavailable");
    expect(screen.getByRole("link", { name: "Assignments" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assign coach" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View unassigned athletes" })).toBeTruthy();
    for (const label of ["Active athletes", "Active staff", "Unassigned"]) {
      expect(screen.getByRole("link", { name: `View matching records: ${label}` })).toBeTruthy();
    }
    expect(screen.getByText(/Supporting coaches do not satisfy this assignment gap/)).toBeTruthy();
    expect(
      screen.getByText(/Timed coverage and plan-horizon signals are not available/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Activity-review and check-in priority data are not available/),
    ).toBeTruthy();
    expect(screen.getByText(/Organization task assignments are not available/)).toBeTruthy();
  });

  it("keeps the organization navigation while the overview is pending", () => {
    const Pending = (Route as unknown as { pendingComponent: ComponentType }).pendingComponent;
    render(<Pending />);

    expect(screen.getByRole("status").textContent).toContain("Loading organization overview");
    expect(screen.getByRole("navigation", { name: "Organization administration" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assignments" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Organization overview" })).toBeNull();
  });

  it("keeps the error frame through a resolved failed retry and prevents duplicate invalidation", async () => {
    let resolveRead: () => void = () => {
      throw new Error("Read not started");
    };
    state.invalidate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const ErrorView = (Route as unknown as { errorComponent: ComponentType }).errorComponent;
    render(<ErrorView />);

    expect(screen.getByRole("navigation", { name: "Organization administration" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "We could not load the organization overview",
    );
    expect(screen.queryByText("24")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry organization overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Retrying organization overview…" }));
    expect(
      screen
        .getByRole("button", { name: "Retrying organization overview…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(state.invalidate).toHaveBeenCalledExactlyOnceWith({ sync: true });
    resolveRead();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry organization overview" })).toBeTruthy(),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "We could not load the organization overview",
    );
  });

  it("renders an actionable empty state for a real zero-engagement overview", () => {
    state.overview = {
      status: "granted",
      overview: {
        activeStaff: 1,
        activeEngagements: 0,
        pausedEngagements: 0,
        activeEngagementsWithoutPrimary: 0,
      },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "No active athletes yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite athlete" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assign coach" })).toBeTruthy();
    expect(screen.queryByText("Coverage gaps")).toBeNull();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("renders an explicit access-lost state instead of organization data", () => {
    state.overview = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);

    expect(screen.getByRole("heading", { name: "Organization access unavailable" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to Personal workspace" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByText("Casey Coach")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry organization overview" })).toBeNull();
  });
});
