// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  organizationId: "org-a",
  actorProfileId: "actor-a",
  search: {} as Record<string, string>,
  location: {
    pathname: "/organizations/org-a/assignments",
    search: {} as Record<string, string>,
  },
  loaded: {
    organizationId: "org-a",
    actorProfileId: "actor-a",
    search: null,
    cursor: null,
    primary: null,
    status: null,
    page: { status: "granted" },
  },
  load: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    state.options = options;
    return {
      ...options,
      useLoaderData: () => state.loaded,
      useParams: () => ({ organizationId: state.organizationId }),
      useRouteContext: () => ({ actorProfileId: state.actorProfileId }),
      useSearch: () => state.search,
    };
  },
  useRouterState: () => state.location,
}));
vi.mock("../../../../lib/coaching/assignment-directory-server-functions", () => ({
  loadOrganizationAssignmentDirectory: state.load,
}));
vi.mock("../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => null,
}));
vi.mock(
  "../../../../components/coaching/organization-coaching-assignments/assignment-directory",
  () => ({
    AssignmentDirectory: () => <div>Private assignment roster</div>,
  }),
);
vi.mock("../../../../components/coaching/organization-overview-frame", () => ({
  OrganizationOverviewFrame: ({
    children,
    activeTab,
  }: {
    children: ReactNode;
    activeTab?: string;
  }) => <div data-active-tab={activeTab}>{children}</div>,
}));

import { Route } from "./assignments";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.organizationId = "org-a";
  state.actorProfileId = "actor-a";
  state.search = {};
  state.location = { pathname: "/organizations/org-a/assignments", search: {} };
  state.loaded = {
    organizationId: "org-a",
    actorProfileId: "actor-a",
    search: null,
    cursor: null,
    primary: null,
    status: null,
    page: { status: "granted" },
  };
});

describe("coach assignment directory route", () => {
  it("binds the loader result to the context actor and roster filters", async () => {
    const route = Route as unknown as {
      validateSearch: (value: unknown) => unknown;
      loaderDeps: (input: { search: { q?: string; cursor?: string } }) => unknown;
      loader: (input: {
        params: { organizationId: string };
        deps: {
          search: string | null;
          cursor: string | null;
          primary: "unassigned" | null;
          status: "active" | "paused" | null;
        };
        context: { actorProfileId: string };
      }) => Promise<unknown>;
    };
    expect(route.validateSearch({ q: " Alex " })).toEqual({ q: "Alex" });
    expect(() => route.validateSearch({ q: "   " })).toThrow();
    expect(route.loaderDeps({ search: {} })).toEqual({
      search: null,
      cursor: null,
      primary: null,
      status: null,
    });
    state.load.mockResolvedValueOnce({ status: "forbidden" });
    await expect(
      route.loader({
        params: { organizationId: "11111111-1111-4111-8111-111111111111" },
        deps: { search: "Alex", cursor: null, primary: null, status: null },
        context: { actorProfileId: "actor-loader" },
      }),
    ).resolves.toEqual({
      organizationId: "11111111-1111-4111-8111-111111111111",
      actorProfileId: "actor-loader",
      search: "Alex",
      cursor: null,
      primary: null,
      status: null,
      page: { status: "forbidden" },
    });
    expect(state.load).toHaveBeenCalledWith({
      data: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        limit: 20,
        cursor: null,
        engagementStatus: null,
        withoutPrimaryAssignment: false,
      },
    });
  });

  it("hides a stale actor's roster before a matching loader response arrives", () => {
    state.actorProfileId = "actor-b";
    const Page = state.options.component as ComponentType;
    render(<Page />);

    expect(screen.getByRole("status").textContent).toContain("Loading coach assignments");
    expect(screen.queryByText("Private assignment roster")).toBeNull();
  });

  it.each(["organization", "filter"])("hides prior roster data on %s mismatch", (change) => {
    if (change === "organization") {
      state.organizationId = "org-b";
      state.location.pathname = "/organizations/org-b/assignments";
    }
    if (change === "filter") {
      state.search = { q: "Alex" };
      state.location.search = state.search;
    }
    const Page = state.options.component as ComponentType;
    render(<Page />);

    expect(screen.getByRole("status").textContent).toContain("Loading coach assignments");
    expect(screen.queryByText("Private assignment roster")).toBeNull();
  });

  it("renders the roster in the shared organization frame only when route, filters, and actor all match", () => {
    const Page = state.options.component as ComponentType;
    render(<Page />);

    expect(screen.getByText("Private assignment roster")).toBeTruthy();
    expect(
      screen.getByText("Private assignment roster").parentElement?.getAttribute("data-active-tab"),
    ).toBe("assignments");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
