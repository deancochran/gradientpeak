import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {
    getSession: vi.fn(async () => ({ data: null })),
    signOut: vi.fn(async () => ({ data: null })),
  },
  createExpoClient: vi.fn(),
  storage: {
    getItem: vi.fn(() => null),
    getItemAsync: vi.fn(async () => null),
    setItem: vi.fn(),
    setItemAsync: vi.fn(async () => undefined),
    setItemAsyncStrict: vi.fn(async () => undefined),
  },
}));

vi.mock("@repo/auth/client/expo", () => ({
  createGradientPeakExpoAuthClient: mocks.createExpoClient,
}));
vi.mock("@repo/auth/client", () => ({
  normalizeGradientPeakAuthClientSession: () => null,
  resolveGradientPeakAuthBaseUrl: ({ appBaseUrl }: { appBaseUrl: string }) =>
    `${appBaseUrl}/api/auth`,
}));
vi.mock("@/lib/hooks/useAppScheme", () => ({ getAppScheme: () => "gradientpeak-dev" }));
vi.mock("@/lib/storage/safe-secure-store", () => ({ safeSecureStore: mocks.storage }));
vi.mock("@/lib/server-config", () => ({
  getServerConfig: () => ({ apiUrl: "https://api-a.example.com" }),
  subscribeServerConfig: () => () => undefined,
}));

describe("mobile Better Auth client configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createExpoClient.mockReset();
    mocks.createExpoClient.mockReturnValue(mocks.client);
    mocks.client.signOut.mockReset();
    mocks.client.signOut.mockResolvedValue({ data: null });
    mocks.storage.setItemAsync.mockClear();
    mocks.storage.setItemAsyncStrict.mockReset();
    mocks.storage.setItemAsyncStrict.mockResolvedValue(undefined);
  });

  it("uses the Expo async storage adapter with an origin-bound prefix", async () => {
    await import("./client");

    expect(mocks.createExpoClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api-a.example.com/api/auth",
        scheme: "gradientpeak-dev",
        storage: expect.objectContaining({
          getItemAsync: expect.any(Function),
          setItemAsync: expect.any(Function),
        }),
        storagePrefix: "gradientpeak_68747470733a2f2f6170692d612e6578616d706c652e636f6d",
      }),
    );
    expect(mocks.storage).toEqual(
      expect.objectContaining({
        getItemAsync: expect.any(Function),
        setItemAsync: expect.any(Function),
      }),
    );
  });

  it("purges the old origin's local credentials when remote sign-out fails", async () => {
    mocks.client.signOut.mockRejectedValue(new Error("offline"));
    const { signOutMobileAuth } = await import("./client");

    await expect(signOutMobileAuth()).resolves.toBeUndefined();

    expect(mocks.storage.setItemAsyncStrict).toHaveBeenCalledWith(
      "gradientpeak_68747470733a2f2f6170692d612e6578616d706c652e636f6d_cookie",
      "{}",
    );
    expect(mocks.storage.setItemAsyncStrict).toHaveBeenCalledWith(
      "gradientpeak_68747470733a2f2f6170692d612e6578616d706c652e636f6d_session_data",
      "{}",
    );
  });

  it("reports a local credential purge failure instead of claiming logout succeeded", async () => {
    mocks.storage.setItemAsyncStrict.mockRejectedValue(new Error("SecureStore unavailable"));
    const { signOutMobileAuth } = await import("./client");

    await expect(signOutMobileAuth()).rejects.toThrow(
      "Local sign-out could not clear secure credentials.",
    );
  });
});
