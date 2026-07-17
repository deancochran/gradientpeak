import type { AuthSession } from "@repo/auth/session";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWebAuthSession } = vi.hoisted(() => ({
  getWebAuthSession: vi.fn<() => Promise<AuthSession | null>>(),
}));

vi.mock("./client", () => ({ getWebAuthSession }));

import { resolveRouteAuthSession } from "./route-guards";

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
