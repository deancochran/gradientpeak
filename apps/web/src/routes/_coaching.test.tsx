import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveRouteAuthSession: vi.fn(),
  redirect: vi.fn((options: unknown) => ({ redirect: options })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Outlet: () => null,
  redirect: mocks.redirect,
}));

vi.mock("../lib/auth/route-guards", () => ({
  authSessionMiddleware: { name: "auth-session" },
  resolveRouteAuthSession: mocks.resolveRouteAuthSession,
}));

import { Route } from "./_coaching";

type BeforeLoad = (input: {
  location: { href: string };
  serverContext?: { session?: { user?: { id: string } } | null };
}) => Promise<void>;

const beforeLoad = (Route as unknown as { beforeLoad: BeforeLoad }).beforeLoad;

describe("coaching authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated profiles to login with the coaching return URL", async () => {
    mocks.resolveRouteAuthSession.mockResolvedValue(null);

    await expect(
      beforeLoad({ location: { href: "/organizations/org-1/dashboard" } }),
    ).rejects.toEqual({
      redirect: {
        to: "/auth/login",
        search: {
          flash: undefined,
          flashType: undefined,
          redirect: "/organizations/org-1/dashboard",
        },
      },
    });
  });

  it("allows an authenticated profile through the shared route boundary", async () => {
    const serverContext = { session: { user: { id: "profile-1" } } };
    mocks.resolveRouteAuthSession.mockResolvedValue(serverContext.session);

    await expect(
      beforeLoad({
        location: { href: "/organizations/org-1/dashboard" },
        serverContext,
      }),
    ).resolves.toBeUndefined();
    expect(mocks.resolveRouteAuthSession).toHaveBeenCalledWith(serverContext);
  });
});
