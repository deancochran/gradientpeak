// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loaded: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    actorProfileId: "profile-1",
    groupId: "22222222-2222-4222-8222-222222222222",
    result: {
      status: "granted" as const,
      group: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Tempo",
        description: null,
        createdAt: new Date(),
      },
    },
  } as unknown,
  params: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    groupId: "22222222-2222-4222-8222-222222222222",
  },
  context: { actorProfileId: "profile-1" },
  pathname:
    "/organizations/11111111-1111-4111-8111-111111111111/groups/22222222-2222-4222-8222-222222222222",
  matches: [] as Array<Record<string, unknown>>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaded,
    useParams: () => state.params,
    useRouteContext: () => state.context,
  }),
  useRouterState: ({
    select,
  }: {
    select: (value: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: state.pathname } }),
  useMatches: ({ select }: { select: (matches: Array<Record<string, unknown>>) => unknown }) =>
    select(state.matches),
  Link: ({ children }: { children: ReactNode }) => <a href="/organizations">{children}</a>,
  Outlet: () => <div>nested group navigation</div>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("../../../../../components/coaching/coach-access-denied", () => ({
  CoachAccessDenied: () => <h1>Coaching access required</h1>,
}));
vi.mock("../../../../../lib/coaching/organization-groups-server-functions", () => ({
  loadOrganizationGroup: vi.fn(),
  archiveOrganizationGroup: vi.fn(),
}));

import { Route } from "./$groupId";

afterEach(() => {
  cleanup();
  state.params = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    groupId: "22222222-2222-4222-8222-222222222222",
  };
  state.context = { actorProfileId: "profile-1" };
  state.pathname = `/organizations/${state.params.organizationId}/groups/${state.params.groupId}`;
  state.matches = [];
  state.loaded = {
    organizationId: state.params.organizationId,
    actorProfileId: state.context.actorProfileId,
    groupId: state.params.groupId,
    result: {
      status: "granted",
      group: { id: state.params.groupId, name: "Tempo", description: null, createdAt: new Date() },
    },
  };
});

describe("organization group detail route", () => {
  it.each([
    [
      "organization",
      () =>
        (state.params = {
          ...state.params,
          organizationId: "33333333-3333-4333-8333-333333333333",
        }),
    ],
    ["actor", () => (state.context = { actorProfileId: "profile-2" })],
    [
      "group",
      () => (state.params = { ...state.params, groupId: "44444444-4444-4444-8444-444444444444" }),
    ],
    ["path", () => (state.pathname = "/organizations/other/groups/other")],
    [
      "unknown descendant",
      () =>
        (state.pathname = `/organizations/${state.params.organizationId}/groups/${state.params.groupId}/unknown`),
    ],
  ])("hides archive and roster controls while the current %s identity is unresolved", (_identity, change) => {
    change();
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("status", { name: "Loading organization group" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive group" })).toBeNull();
  });
  it.each([
    "/",
    "/coaches/",
    "/athletes/",
  ])("keeps supported trailing-slash paths loaded", (suffix) => {
    state.pathname = `/organizations/${state.params.organizationId}/groups/${state.params.groupId}${suffix}`;
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("button", { name: "Archive group" })).toBeTruthy();
  });
  it("retains the actual nested coaching navigation for the loaded group", () => {
    state.pathname = `${state.pathname}/coaches`;
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("button", { name: "Archive group" })).toBeTruthy();
    expect(screen.getByText("nested group navigation")).toBeTruthy();
  });
  it("renders access denial instead of stale group controls", () => {
    state.loaded = {
      organizationId: state.params.organizationId,
      actorProfileId: state.context.actorProfileId,
      groupId: state.params.groupId,
      result: { status: "forbidden" },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive group" })).toBeNull();
  });
  it.each([
    "coaches",
    "athletes",
  ])("server-renders no protected parent content when the initial %s child read is denied", (child) => {
    state.matches = [
      {
        routeId: `/_coaching/organizations/$organizationId/groups/$groupId/${child}`,
        params: state.params,
        loaderData: {
          organizationId: state.params.organizationId,
          groupId: state.params.groupId,
          actorProfileId: state.context.actorProfileId,
          result: { status: "forbidden" },
        },
      },
    ];
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    const html = renderToString(<Component />);
    expect(html).toContain("Group access required");
    expect(html).not.toContain("Tempo");
    expect(html).not.toContain("No description provided.");
    expect(html).not.toContain("Archive group");
    expect(html).not.toContain("All organization groups");
    expect(html).not.toContain("Coach assignments");
    expect(html).not.toContain("Athlete assignments");
  });
  it.each([
    [
      "wrong organization",
      { organizationId: "other", groupId: state.params.groupId },
      "profile-1",
      "coaches",
    ],
    [
      "wrong group",
      { organizationId: state.params.organizationId, groupId: "other" },
      "profile-1",
      "athletes",
    ],
    ["wrong actor", state.params, "profile-2", "coaches"],
    ["unknown child", state.params, "profile-1", "unknown"],
  ])("does not redact the parent for a %s child match", (_reason, params, actorProfileId, child) => {
    state.matches = [
      {
        routeId: `/_coaching/organizations/$organizationId/groups/$groupId/${child}`,
        params,
        loaderData: {
          organizationId: params.organizationId,
          groupId: params.groupId,
          actorProfileId,
          result: { status: "forbidden" },
        },
      },
    ];
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    const html = renderToString(<Component />);
    expect(html).toContain("Tempo");
    expect(html).toContain("Archive group");
    expect(html).not.toContain("Group access required");
  });
});
