// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loaded: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    actorProfileId: "profile-1",
    cursor: null as string | null,
    result: { status: "granted" as const, items: [], nextCursor: null, hasMore: false },
  } as unknown,
  search: {} as { cursor?: string },
  params: { organizationId: "11111111-1111-4111-8111-111111111111" },
  context: { actorProfileId: "profile-1" },
  pathname: "/organizations/11111111-1111-4111-8111-111111111111/groups",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaded,
    useSearch: () => state.search,
    useParams: () => state.params,
    useRouteContext: () => state.context,
  }),
  useRouterState: ({
    select,
  }: {
    select: (value: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: state.pathname } }),
  Link: ({ children }: { children: ReactNode }) => <a href="/organizations">{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("../../../../../components/coaching/organization-groups/organization-group-list", () => ({
  OrganizationGroupList: () => <div>group controls</div>,
  OrganizationGroupsPending: () => (
    <p aria-label="Loading organization groups" role="status">
      Loading organization groups…
    </p>
  ),
  OrganizationGroupsError: () => <p role="alert">groups error</p>,
}));
vi.mock("../../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => <h1>Coaching access required</h1>,
}));
vi.mock("../../../../../lib/coaching/organization-groups-server-functions", () => ({
  loadOrganizationGroups: vi.fn(),
}));

import { Route } from "./index";

afterEach(() => {
  cleanup();
  state.params = { organizationId: "11111111-1111-4111-8111-111111111111" };
  state.context = { actorProfileId: "profile-1" };
  state.search = {};
  state.pathname = "/organizations/11111111-1111-4111-8111-111111111111/groups";
  state.loaded = {
    organizationId: state.params.organizationId,
    actorProfileId: state.context.actorProfileId,
    cursor: null,
    result: { status: "granted", items: [], nextCursor: null, hasMore: false },
  };
});

describe("organization groups index route", () => {
  it.each([
    [
      "organization",
      () => (state.params = { organizationId: "22222222-2222-4222-8222-222222222222" }),
    ],
    ["actor", () => (state.context = { actorProfileId: "profile-2" })],
    ["cursor", () => (state.search = { cursor: "33333333-3333-4333-8333-333333333333" })],
    ["path", () => (state.pathname = "/organizations/other/groups")],
  ])("hides group controls while the current %s identity is unresolved", (_identity, change) => {
    change();
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("status", { name: "Loading organization groups" })).toBeTruthy();
    expect(screen.queryByText("group controls")).toBeNull();
  });
  it("renders access denial instead of prior group controls", () => {
    state.loaded = {
      organizationId: state.params.organizationId,
      actorProfileId: state.context.actorProfileId,
      cursor: null,
      result: { status: "forbidden" },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
    expect(screen.queryByText("group controls")).toBeNull();
  });
});
