import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedAuthCookieHeader,
  setCachedAuthCookieHeader,
} from "@/lib/auth/secure-session-cache";

const secureStoreMock = SecureStore as typeof SecureStore & {
  __store: Map<string, string>;
};

let mockedSession: { bearerToken?: string } | null = null;

async function loadRequestAuthModule() {
  vi.resetModules();
  vi.doMock("@/lib/auth/auth-client", () => ({
    getAuthClient: () => ({
      getCookie: () => null,
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
    await clearCachedAuthCookieHeader();
    secureStoreMock.__store.clear();
  });

  it("prefers a cached cookie header over the bearer bridge", async () => {
    const { getAuthHeaders, getAuthTransport } = await loadRequestAuthModule();

    mockedSession = { bearerToken: "bridge-token" };
    await setCachedAuthCookieHeader("better-auth.session=abc123");

    const headers = await getAuthHeaders();

    expect(headers.get("Cookie")).toBe("better-auth.session=abc123");
    expect(headers.get("Authorization")).toBeNull();
    await expect(getAuthTransport()).resolves.toBe("cookie");
  });

  it("falls back to the bearer bridge when no cookie cache exists", async () => {
    const { getAuthHeaders, getAuthTransport } = await loadRequestAuthModule();

    mockedSession = { bearerToken: "bridge-token" };

    const headers = await getAuthHeaders();

    expect(headers.get("Authorization")).toBe("Bearer bridge-token");
    expect(headers.get("Cookie")).toBeNull();
    await expect(getAuthTransport()).resolves.toBe("bearer");
  });
});
