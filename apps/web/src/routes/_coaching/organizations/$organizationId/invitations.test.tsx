// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  result: {
    status: "granted" as const,
    page: { items: [], nextCursor: null, hasMore: false },
    canInviteAdministrators: false,
  } as unknown,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.result,
    useSearch: () => ({}),
    useParams: () => ({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    useRouteContext: () => ({ actorProfileId: "profile-1" }),
  }),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("../../../../lib/coaching/organization-invitations-server-functions", () => ({
  loadOrganizationInvitations: vi.fn(),
  createOrganizationInvitation: vi.fn(),
  revokeOrganizationInvitation: vi.fn(),
}));

import { Route } from "./invitations";

afterEach(() => {
  cleanup();
  state.result = {
    status: "granted",
    page: { items: [], nextCursor: null, hasMore: false },
    canInviteAdministrators: false,
  };
});
describe("organization invitations route", () => {
  it("renders the current organization invitation page", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Organization invitations" })).toBeTruthy();
  });
  it("renders access loss instead of stale invitation data", () => {
    state.result = { status: "forbidden" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    render(<Component />);
    expect(screen.getByRole("heading", { name: "Organization access unavailable" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to Personal workspace" }).getAttribute("href"),
    ).toBe("/");
  });
});
