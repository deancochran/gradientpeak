import type { AuthSession } from "@repo/auth/session";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWebAuthSession } = vi.hoisted(() => ({
  getWebAuthSession: vi.fn<() => Promise<AuthSession | null>>(),
}));

vi.mock("./client", () => ({ getWebAuthSession }));

import {
  getAuthenticatedEntryDestination,
  getProtectedAccessRedirect,
  resolveRouteAuthSession,
  toPublicAuthViewer,
} from "./route-guards";

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

describe("toPublicAuthViewer", () => {
  it("serializes only the public user snapshot, never session credentials or metadata", () => {
    const result = toPublicAuthViewer({
      sessionId: "session-secret",
      transport: "bearer",
      bearerToken: "bearer-secret",
      expiresAt: "2026-01-01T00:00:00.000Z",
      user: { id: "user-1", email: "user@example.test", emailVerified: true },
    });

    expect(result).toEqual({
      version: 1,
      user: { id: "user-1", email: "user@example.test", emailVerified: true },
    });
    expect(JSON.stringify(result)).not.toMatch(/session-secret|bearer-secret|expiresAt/);
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
    expect(
      getProtectedAccessRedirect(authenticatedSession, "processing", "/activity-plans"),
    ).toEqual({
      destination: "onboarding",
      redirectTo: "/activity-plans",
    });
  });

  it("allows verified users with completed onboarding into the protected shell", () => {
    expect(getProtectedAccessRedirect(authenticatedSession, "completed", "/")).toBeNull();
  });
});

describe("getAuthenticatedEntryDestination", () => {
  it("sends verified incomplete users directly to onboarding", () => {
    expect(getAuthenticatedEntryDestination(authenticatedSession, "processing")).toBe("onboarding");
  });

  it("sends completed users home", () => {
    expect(getAuthenticatedEntryDestination(authenticatedSession, "completed")).toBe("home");
  });
});
