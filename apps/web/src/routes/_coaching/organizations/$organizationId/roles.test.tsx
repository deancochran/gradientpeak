// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invalidate: vi.fn(),
  loaded: {
    actorProfileId: "actor-1",
    organizationId: "11111111-1111-4111-8111-111111111111",
    staff: { status: "granted" as const, page: { items: [], nextCursor: null, hasMore: false } },
  } as unknown,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaded,
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    useRouteContext: () => ({ actorProfileId: "actor-1" }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/organizations">{children}</a>,
  useRouter: () => ({ invalidate: state.invalidate }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) =>
    select({ location: { pathname: "/organizations/11111111-1111-4111-8111-111111111111/roles" } }),
}));
vi.mock("../../../../lib/coaching/organization-roles-server-functions", () => ({
  loadOrganizationRoleStaff: vi.fn(),
}));
vi.mock("../../../../components/coaching/organization-overview-frame", () => ({
  OrganizationOverviewFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { Route } from "./roles";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.loaded = {
    actorProfileId: "actor-1",
    organizationId: "11111111-1111-4111-8111-111111111111",
    staff: { status: "granted", page: { items: [], nextCursor: null, hasMore: false } },
  };
});

describe("organization roles route", () => {
  it("renders only the loader's organization-scoped staff page", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByText("Organization roles")).toBeTruthy();
  });

  it("hides roles when the authoritative staff read loses access", () => {
    state.loaded = {
      actorProfileId: "actor-1",
      organizationId: "11111111-1111-4111-8111-111111111111",
      staff: { status: "forbidden" },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByText("Coaching access required")).toBeTruthy();
  });

  it("offers an actionable route-read retry instead of an inert load error", () => {
    const ErrorComponent = (Route as unknown as { errorComponent: React.ComponentType })
      .errorComponent;
    render(<ErrorComponent />);
    fireEvent.click(screen.getByRole("button", { name: "Retry organization roles" }));
    expect(state.invalidate).toHaveBeenCalledWith({ sync: true });
  });
});
