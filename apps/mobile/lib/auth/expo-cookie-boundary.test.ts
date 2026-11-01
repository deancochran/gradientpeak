import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  let serverConfigListener: (() => void) | undefined;

  return {
    values,
    getServerConfig: vi.fn(() => ({ apiUrl: "https://api.example.test" })),
    subscribeServerConfig: vi.fn((listener: () => void) => {
      serverConfigListener = listener;
      return () => {
        if (serverConfigListener === listener) serverConfigListener = undefined;
      };
    }),
    notifyServerConfigChange: () => serverConfigListener?.(),
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      getItemAsync: async (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      setItemAsync: async (key: string, value: string) => {
        values.set(key, value);
      },
      setItemAsyncStrict: async (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
});

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: "ios" },
}));
vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("expo-linking", () => ({
  createURL: (path: string, options?: { scheme?: string }) =>
    `${options?.scheme ?? "gradientpeak-dev"}://${path}`,
}));
vi.mock("expo-network", () => ({ addNetworkStateListener: () => ({ remove: () => undefined }) }));
vi.mock("@/lib/hooks/useAppScheme", () => ({ getAppScheme: () => "gradientpeak-dev" }));
vi.mock("@/lib/server-config", () => ({
  getServerConfig: mocks.getServerConfig,
  subscribeServerConfig: mocks.subscribeServerConfig,
}));
vi.mock("@/lib/storage/safe-secure-store", () => ({ safeSecureStore: mocks.storage }));
const cookieStorageKey = "gradientpeak_68747470733a2f2f6170692e6578616d706c652e74657374_cookie";

function jsonResponse(body: unknown, setCookie?: string) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...(setCookie ? { "set-cookie": setCookie } : {}),
    },
  });
}

async function loadBoundary() {
  return import("./client");
}

describe("real Expo Better Auth cookie boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.values.clear();
    mocks.getServerConfig.mockClear();
    mocks.subscribeServerConfig.mockClear();
    vi.unstubAllGlobals();
  });

  it("persists a server Set-Cookie through the real Expo plugin and sends it without a bearer", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        { token: "not-used-by-mobile-transport" },
        "better-auth.session_token=cookie-only-session; Path=/; HttpOnly",
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const { authClient, getMobileAuthHeaders } = await loadBoundary();

    await authClient.signIn.email({ email: "athlete@example.test", password: "password" });

    expect(mocks.values.get(cookieStorageKey)).toContain("better-auth.session_token");
    await expect(authClient.getCookie()).resolves.toBe(
      "better-auth.session_token=cookie-only-session",
    );

    const headers = await getMobileAuthHeaders("https://api.example.test/api/trpc/activity.list");
    expect(headers.get("Cookie")).toBe("better-auth.session_token=cookie-only-session");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("does not let a late pre-logout response persist after the app retires its storage generation", async () => {
    let resolveGetSession: ((response: Response) => void) | undefined;
    let notifyGetSessionStarted: (() => void) | undefined;
    const getSessionResponse = new Promise<Response>((resolve) => {
      resolveGetSession = resolve;
    });
    const getSessionStarted = new Promise<void>((resolve) => {
      notifyGetSessionStarted = resolve;
    });
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/get-session")) {
        notifyGetSessionStarted?.();
        return getSessionResponse;
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetch);

    const { authClient, signOutMobileAuth } = await loadBoundary();
    const inFlightGetSession = authClient.getSession();
    await getSessionStarted;

    await signOutMobileAuth();
    expect(mocks.values.get(cookieStorageKey)).toBe("{}");

    resolveGetSession?.(
      jsonResponse({}, "better-auth.session_token=late-revoked-cookie; Path=/; HttpOnly"),
    );
    await inFlightGetSession;

    expect(mocks.values.get(cookieStorageKey)).toBe("{}");
  });
});
