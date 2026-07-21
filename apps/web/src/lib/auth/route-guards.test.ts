import type { AuthSession } from "@repo/auth/session";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWebAuthSession } = vi.hoisted(() => ({
  getWebAuthSession: vi.fn<() => Promise<AuthSession | null>>(),
}));

vi.mock("./client", () => ({ getWebAuthSession }));

import { getProtectedAccessRedirect, resolveRouteAuthSession } from "./route-guards";

const authenticatedSession = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    email: "athlete@example.com",
    emailVerified: true,
  },
  transport: "cookie",
} satisfies AuthSession;

describe("resolveRouteAuthSession", () => {
  beforeEach(() => {
    getWebAuthSession.mockReset();
  });

  it("uses an authenticated server session without calling the client fallback", async () => {
    await expect(resolveRouteAuthSession({ session: authenticatedSession })).resolves.toBe(
      authenticatedSession,
    );
    expect(getWebAuthSession).not.toHaveBeenCalled();
  });

  it("treats an anonymous server session as authoritative", async () => {
    await expect(resolveRouteAuthSession({ session: null })).resolves.toBeNull();
    expect(getWebAuthSession).not.toHaveBeenCalled();
  });

  it("falls back to the client session when server context is missing", async () => {
    getWebAuthSession.mockResolvedValue(authenticatedSession);

    await expect(resolveRouteAuthSession()).resolves.toBe(authenticatedSession);
    expect(getWebAuthSession).toHaveBeenCalledOnce();
  });
});

describe("getProtectedAccessRedirect", () => {
  it("sends anonymous users to login with their requested destination", () => {
    expect(getProtectedAccessRedirect(null, null, "/calendar?view=week")).toEqual({
      destination: "login",
      redirectTo: "/calendar?view=week",
    });
  });

  it("sends authenticated unverified users to verification", () => {
    expect(
      getProtectedAccessRedirect(
        { ...authenticatedSession, user: { ...authenticatedSession.user, emailVerified: false } },
        null,
        "/settings",
      ),
    ).toEqual({ destination: "verify" });
  });

  it("sends verified incomplete users to onboarding", () => {
    expect(getProtectedAccessRedirect(authenticatedSession, false, "/activity-plans")).toEqual({
      destination: "onboarding",
      redirectTo: "/activity-plans",
    });
  });

  it("allows verified onboarded users into the protected shell", () => {
    expect(getProtectedAccessRedirect(authenticatedSession, true, "/")).toBeNull();
  });
});
