// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invalidate: vi.fn(),
  loaded: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    actorProfileId: "profile-1",
    cursor: null,
    result: {
      status: "granted" as const,
      page: { items: [], nextCursor: null, hasMore: false },
      canInviteAdministrators: false,
    },
  } as unknown,
  search: {} as { cursor?: string },
  params: { organizationId: "11111111-1111-4111-8111-111111111111" },
  context: { actorProfileId: "profile-1" },
  pathname: "/organizations/11111111-1111-4111-8111-111111111111/invitations",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaded,
    useSearch: () => state.search,
    useParams: () => state.params,
    useRouteContext: () => state.context,
  }),
  useRouter: () => ({ invalidate: state.invalidate }),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: state.pathname } }),
  Link: ({ children }: { children: ReactNode }) => <a href="/organizations">{children}</a>,
}));
vi.mock("../../../../lib/coaching/organization-invitations-server-functions", () => ({
  loadOrganizationInvitations: vi.fn(),
  createOrganizationInvitation: vi.fn(),
  revokeOrganizationInvitation: vi.fn(),
  resolveAcceptedOrganizationInvitationRelationship: vi.fn(),
}));

import { Route } from "./invitations";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.params = { organizationId: "11111111-1111-4111-8111-111111111111" };
  state.context = { actorProfileId: "profile-1" };
  state.search = {};
  state.pathname = "/organizations/11111111-1111-4111-8111-111111111111/invitations";
  state.loaded = {
    organizationId: state.params.organizationId,
    actorProfileId: state.context.actorProfileId,
    cursor: null,
    result: {
      status: "granted",
      page: { items: [], nextCursor: null, hasMore: false },
      canInviteAdministrators: false,
    },
  };
});
describe("organization invitations route", () => {
  it("renders the current organization invitation page", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Organization invitations" })).toBeTruthy();
  });
  it("renders access loss instead of stale invitation data", () => {
    state.loaded = {
      organizationId: state.params.organizationId,
      actorProfileId: state.context.actorProfileId,
      cursor: null,
      result: { status: "forbidden" },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Coaching access required" })).toBeTruthy();
  });

  it("announces a loading read without rendering invitation controls or data", () => {
    const Pending = (Route as unknown as { pendingComponent: React.ComponentType })
      .pendingComponent;
    render(<Pending />);
    expect(
      screen.getByRole("status", { name: "Loading organization invitations" }).textContent,
    ).toContain("Loading organization invitations…");
    expect(screen.queryByRole("button", { name: "Create invitation" })).toBeNull();
    expect(screen.queryByLabelText("Invitation history")).toBeNull();
  });

  it("keeps invitation data hidden on a failed read and retries an authoritative route read", async () => {
    const ErrorComponent = (Route as unknown as { errorComponent: React.ComponentType })
      .errorComponent;
    render(<ErrorComponent />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not load organization invitations",
    );
    expect(screen.queryByRole("button", { name: "Create invitation" })).toBeNull();
    expect(screen.queryByLabelText("Invitation history")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry organization invitations" }));
    expect(state.invalidate).toHaveBeenCalledWith({ sync: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry organization invitations" })).toBeTruthy(),
    );
    state.invalidate.mockRejectedValueOnce(new Error("read failed"));
    const retry = screen.getByRole("button", { name: "Retry organization invitations" });
    fireEvent.click(retry);
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("alert").textContent).toContain(
      "could not load organization invitations",
    );
  });

  it.each([
    [
      "organization",
      () => (state.params = { organizationId: "22222222-2222-4222-8222-222222222222" }),
    ],
    ["actor", () => (state.context = { actorProfileId: "profile-2" })],
    ["cursor", () => (state.search = { cursor: "next-page" })],
  ])("hides a prior invitation page while the current %s scope is not loaded", (_scope, changeScope) => {
    changeScope();
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("status", { name: "Loading organization invitations" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create invitation" })).toBeNull();
    expect(screen.queryByLabelText("Invitation history")).toBeNull();
  });

  it("renders a page only when its organization, actor, cursor, and path match", () => {
    state.search = { cursor: "next-page" };
    state.loaded = {
      organizationId: state.params.organizationId,
      actorProfileId: state.context.actorProfileId,
      cursor: "next-page",
      result: {
        status: "granted",
        page: { items: [], nextCursor: null, hasMore: false },
        canInviteAdministrators: false,
      },
    };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Organization invitations" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading organization invitations" })).toBeNull();
  });
});
