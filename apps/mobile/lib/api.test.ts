import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createApiBatchLink = vi.fn((options) => options);
  const createClient = vi.fn();
  const getMobileAuthHeaders = vi.fn<() => Promise<Headers>>();

  return {
    createApiBatchLink,
    createClient,
    getMobileAuthHeaders,
    apiUrl: { current: "http://127.0.0.1:3000" },
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

vi.mock("@/lib/auth/client", () => ({
  getMobileAuthHeaders: mocks.getMobileAuthHeaders,
}));

vi.mock("@/lib/logging/mobile-action-log", () => ({
  getMobileDeviceKind: () => "phone",
  logMobileAction: vi.fn(),
}));

vi.mock("@/lib/server-config", () => ({
  getServerConfig: () => ({ apiUrl: mocks.apiUrl.current }),
}));

import { createApiClient } from "./api";

describe("mobile tRPC auth headers", () => {
  beforeEach(() => {
    mocks.createApiBatchLink.mockClear();
    mocks.createClient.mockClear();
    mocks.getMobileAuthHeaders.mockReset();
    mocks.apiUrl.current = "http://127.0.0.1:3000";
  });

  it("awaits Better Auth's cookie for the first cookie-only request", async () => {
    mocks.getMobileAuthHeaders.mockResolvedValue(
      new Headers({ Cookie: "better-auth.session=cold-start" }),
    );

    createApiClient();

    const headers = mocks.createApiBatchLink.mock.calls[0]?.[0].headers as () => Promise<Headers>;
    const resolvedHeaders = await headers();

    expect(mocks.getMobileAuthHeaders).toHaveBeenCalledTimes(1);
    expect(resolvedHeaders.get("Cookie")).toBe("better-auth.session=cold-start");
    expect(resolvedHeaders.get("Authorization")).toBeNull();
    expect(resolvedHeaders.get("x-client-type")).toBe("mobile");
  });

  it("does not reuse a cookie after logout or a server switch", async () => {
    mocks.getMobileAuthHeaders
      .mockResolvedValueOnce(new Headers({ Cookie: "better-auth.session=old-server" }))
      .mockResolvedValueOnce(new Headers());

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
