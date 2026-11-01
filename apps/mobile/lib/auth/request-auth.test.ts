import { beforeEach, describe, expect, it, vi } from "vitest";

let mockedSession: { bearerToken?: string } | null = null;
let mockedCookie: string | null = null;
const getCookieMock = vi.fn(async () => mockedCookie);

async function loadRequestAuthModule() {
  vi.resetModules();
  vi.doMock("@/lib/auth/auth-client", () => ({
    getAuthClient: () => ({
      getCookie: getCookieMock,
    }),
  }));
  vi.doMock("@/lib/stores/auth-store", () => ({
    useAuthStore: {
      getState: () => ({ session: mockedSession }),
    },
  }));

  return import("@/lib/auth/request-auth");
}

describe("request auth headers", () => {
  beforeEach(async () => {
    mockedSession = null;
    mockedCookie = null;
    getCookieMock.mockClear();
  });

  it("uses Better Auth's cookie on a cookie-only cold start", async () => {
    const { getAuthHeaders, getAuthTransport } = await loadRequestAuthModule();

    mockedCookie = "better-auth.session=abc123";

    const headers = await getAuthHeaders();

    expect(headers.get("Cookie")).toBe("better-auth.session=abc123");
    expect(headers.get("Authorization")).toBeNull();
    expect(getCookieMock).toHaveBeenCalledTimes(1);
    await expect(getAuthTransport()).resolves.toBe("cookie");
  });

  it("falls back to the bearer bridge when Better Auth has no cookie", async () => {
    const { getAuthHeaders, getAuthTransport } = await loadRequestAuthModule();

    mockedSession = { bearerToken: "bridge-token" };

    const headers = await getAuthHeaders();

    expect(headers.get("Authorization")).toBe("Bearer bridge-token");
    expect(headers.get("Cookie")).toBeNull();
    await expect(getAuthTransport()).resolves.toBe("bearer");
  });

  it("does not retain an old cookie after logout or a server change", async () => {
    const { getAuthHeaders } = await loadRequestAuthModule();

    mockedCookie = "better-auth.session=old-server";
    expect((await getAuthHeaders()).get("Cookie")).toBe("better-auth.session=old-server");

    mockedCookie = null;
    mockedSession = null;

    const headers = await getAuthHeaders();
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
  });
});
