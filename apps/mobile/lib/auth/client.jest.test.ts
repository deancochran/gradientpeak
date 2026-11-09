const mockGetSession = jest.fn<Promise<{ data: unknown }>, []>();
const mockAtomListen = jest.fn<() => void, [() => void]>();
const mockSessionGet = jest.fn(() => ({ data: { bearerToken: "old-token" }, isPending: true }));
const mockSessionSet = jest.fn();
const mockCreateAuthClient = jest.fn(() => ({
  getSession: mockGetSession,
  $store: {
    atoms: {
      $sessionSignal: { listen: mockAtomListen },
      session: { get: mockSessionGet, set: mockSessionSet },
    },
  },
}));
let mockServerConfigListener: (() => void) | undefined;

jest.mock("@repo/auth/client", () => ({
  normalizeGradientPeakAuthClientSession: jest.fn((session: unknown) => session),
  resolveGradientPeakAuthBaseUrl: jest.fn(() => "https://api.example.test"),
}));
jest.mock("@repo/auth/client/expo", () => ({
  createGradientPeakExpoAuthClient: mockCreateAuthClient,
}));
jest.mock("@repo/api/contract-epoch", () => ({
  CONTRACT_EPOCH_HEADER: "x-gradientpeak-contract-epoch",
  CURRENT_CONTRACT_EPOCH: 1,
}));
jest.mock("@/lib/hooks/useAppScheme", () => ({ getAppScheme: jest.fn(() => "gradientpeak") }));
jest.mock("@/lib/server-config", () => ({
  getServerConfig: jest.fn(() => ({ apiUrl: "https://api.example.test" })),
  subscribeServerConfig: jest.fn((listener: () => void) => {
    mockServerConfigListener = listener;
    return jest.fn();
  }),
}));
jest.mock("@/lib/storage/safe-secure-store", () => ({
  safeSecureStore: { getItem: jest.fn(), setItem: jest.fn() },
}));

let getEmailVerificationCallbackUrl: typeof import("./client").getEmailVerificationCallbackUrl;
let getPasswordResetCallbackUrl: typeof import("./client").getPasswordResetCallbackUrl;
let subscribeToMobileAuthSession: typeof import("./client").subscribeToMobileAuthSession;
let clearMobileAuthSessionCacheForContractEpoch: typeof import("./client").clearMobileAuthSessionCacheForContractEpoch;

describe("mobile auth session emission", () => {
  beforeAll(async () => {
    ({
      getEmailVerificationCallbackUrl,
      getPasswordResetCallbackUrl,
      subscribeToMobileAuthSession,
      clearMobileAuthSessionCacheForContractEpoch,
    } = await import("./client"));
  });

  beforeEach(() => {
    mockGetSession.mockReset();
    mockAtomListen.mockReset();
    mockSessionGet.mockClear();
    mockSessionSet.mockClear();
  });

  it("reports a detached session lookup rejection without an unhandled promise", async () => {
    const error = new Error("Session lookup unavailable");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const unhandledRejection = jest.fn();
    mockGetSession.mockRejectedValueOnce(error);
    process.on("unhandledRejection", unhandledRejection);

    try {
      mockServerConfigListener?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith(
        "[MobileAuthClient] Failed to emit the current session",
        error,
      );
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandledRejection);
      consoleError.mockRestore();
    }
  });

  it.each([
    ["email verification", () => getEmailVerificationCallbackUrl(), "email-verification"],
    ["password reset", () => getPasswordResetCallbackUrl(), "password-reset"],
  ])("routes %s through the canonical web confirmation callback", (_label, callbackUrl, intent) => {
    const callback = new URL(callbackUrl());

    expect(callback.origin).toBe("https://api.example.test");
    expect(callback.pathname).toBe("/auth/confirm");
    expect(Object.fromEntries(callback.searchParams)).toEqual({
      fallback: "/auth/login",
      intent,
      target: "mobile",
    });
    expect(callback.protocol).toBe("https:");
  });

  it("isolates a failing listener so later listeners still receive the session", async () => {
    const error = new Error("Listener failed");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const laterListener = jest.fn();
    let sessionSignalListener: (() => void) | undefined;
    mockGetSession.mockResolvedValue({ data: { bearerToken: "token" } });
    mockAtomListen.mockImplementation((listener) => {
      sessionSignalListener = listener;
      return jest.fn();
    });
    subscribeToMobileAuthSession(() => {
      throw error;
    });
    subscribeToMobileAuthSession(laterListener);

    sessionSignalListener?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith("[MobileAuthClient] Session listener failed", error);
    expect(laterListener).toHaveBeenCalledWith({ bearerToken: "token" });
    consoleError.mockRestore();
  });

  it("uses the current Expo storage keys and sends the contract epoch on auth requests", () => {
    mockGetSession.mockResolvedValue({ data: null });
    mockServerConfigListener?.();

    expect(mockCreateAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePrefix: "gradientpeak",
        fixedHeaders: { "x-gradientpeak-contract-epoch": "1" },
      }),
    );
  });

  it("clears Better Auth's in-memory session atom before a contract-epoch reset", () => {
    clearMobileAuthSessionCacheForContractEpoch();

    expect(mockSessionSet).toHaveBeenCalledWith({ data: null, error: null, isPending: false });
  });
});
