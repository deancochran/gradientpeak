const mockGetSession = jest.fn<Promise<{ data: unknown }>, []>();
const mockAtomListen = jest.fn<() => void, [() => void]>();
let mockServerConfigListener: (() => void) | undefined;

jest.mock("@repo/auth/client", () => ({
  normalizeGradientPeakAuthClientSession: jest.fn((session: unknown) => session),
  resolveGradientPeakAuthBaseUrl: jest.fn(() => "https://api.example.test"),
}));
jest.mock("@repo/auth/client/expo", () => ({
  createGradientPeakExpoAuthClient: jest.fn(() => ({
    getSession: mockGetSession,
    $store: { atoms: { $sessionSignal: { listen: mockAtomListen } } },
  })),
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

let subscribeToMobileAuthSession: typeof import("./client").subscribeToMobileAuthSession;

describe("mobile auth session emission", () => {
  beforeAll(async () => {
    ({ subscribeToMobileAuthSession } = await import("./client"));
  });

  beforeEach(() => {
    mockGetSession.mockReset();
    mockAtomListen.mockReset();
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
});
