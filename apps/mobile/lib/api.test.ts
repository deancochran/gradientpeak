import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createApiBatchLink = vi.fn((options) => options);
  const createClient = vi.fn();
  const getCookie = vi.fn<() => Promise<string | null>>();

  return {
    createApiBatchLink,
    createClient,
    getCookie,
    session: {
      current: null as { bearerToken?: string; user?: { id: string } } | null,
    },
  };
});

vi.mock("@repo/api/react", () => ({
  api: { createClient: mocks.createClient },
  createApiBatchLink: mocks.createApiBatchLink,
  createApiUrl: (baseUrl: string) => `${baseUrl}/api/trpc`,
  createVanillaApiClient: vi.fn(),
  loggerLink: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("@/lib/auth/auth-client", () => ({
  getAuthClient: () => ({ getCookie: mocks.getCookie }),
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: { getState: () => ({ session: mocks.session.current }) },
}));

vi.mock("@/lib/logging/mobile-action-log", () => ({
  getMobileDeviceKind: () => "phone",
  logMobileAction: vi.fn(),
}));

vi.mock("@/lib/server-config", () => ({
  getServerConfig: () => ({ apiUrl: "http://127.0.0.1:3000" }),
}));

import { createApiClient } from "./api";
import { hasSessionAuthCredentials } from "./auth/auth-headers";

describe("mobile tRPC auth headers", () => {
  beforeEach(() => {
    mocks.createApiBatchLink.mockClear();
    mocks.createClient.mockClear();
    mocks.getCookie.mockReset();
    mocks.session.current = null;
  });

  it("awaits Better Auth's cookie for the first cookie-only request", async () => {
    mocks.session.current = { user: { id: "user-1" } };
    mocks.getCookie.mockResolvedValue("better-auth.session=cold-start");

    createApiClient();

    const headers = mocks.createApiBatchLink.mock.calls[0]?.[0].headers as () => Promise<Headers>;
    const resolvedHeaders = await headers();

    expect(mocks.getCookie).toHaveBeenCalledTimes(1);
    expect(resolvedHeaders.get("Cookie")).toBe("better-auth.session=cold-start");
    expect(resolvedHeaders.get("Authorization")).toBeNull();
    expect(resolvedHeaders.get("x-client-type")).toBe("mobile");
    expect(hasSessionAuthCredentials()).toBe(true);
  });

  it("falls back to the bearer bridge only when Better Auth has no cookie", async () => {
    mocks.session.current = { bearerToken: "bridge-token" };
    mocks.getCookie.mockResolvedValue(null);

    createApiClient();

    const headers = mocks.createApiBatchLink.mock.calls[0]?.[0].headers as () => Promise<Headers>;
    const resolvedHeaders = await headers();

    expect(resolvedHeaders.get("Cookie")).toBeNull();
    expect(resolvedHeaders.get("Authorization")).toBe("Bearer bridge-token");
  });

  it("does not reuse a cookie after logout or a server switch", async () => {
    mocks.getCookie.mockResolvedValueOnce("better-auth.session=old-server").mockResolvedValue(null);

    createApiClient();
    const oldHeaders = mocks.createApiBatchLink.mock.calls[0]?.[0]
      .headers as () => Promise<Headers>;
    expect((await oldHeaders()).get("Cookie")).toBe("better-auth.session=old-server");

    createApiClient();
    const currentHeaders = mocks.createApiBatchLink.mock.calls[1]?.[0]
      .headers as () => Promise<Headers>;
    const resolvedHeaders = await currentHeaders();

    expect(resolvedHeaders.get("Cookie")).toBeNull();
    expect(resolvedHeaders.get("Authorization")).toBeNull();
  });
});
