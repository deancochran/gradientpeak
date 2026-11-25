import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadServerConfigModule(environment = "development", serverOverrideEnabled = false) {
  vi.resetModules();
  process.env.APP_ENV = environment;
  process.env.EXPO_PUBLIC_API_URL = "https://api.gradientpeak.app";
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://db.gradientpeak.app";
  if (serverOverrideEnabled) {
    process.env.EXPO_PUBLIC_ENABLE_SERVER_OVERRIDE = "1";
  } else {
    delete process.env.EXPO_PUBLIC_ENABLE_SERVER_OVERRIDE;
  }

  const secureStore = await import("expo-secure-store");
  const store = Reflect.get(secureStore, "__store");
  if (!(store instanceof Map))
    throw new Error("SecureStore test mock is missing its backing store");
  store.clear();

  const module = await import("./server-config");
  return { module, secureStore };
}

describe("server-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_ENV;
    delete process.env.EXPO_PUBLIC_ENABLE_SERVER_OVERRIDE;
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL;
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL;
  });

  it("loads hosted defaults when no override exists", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(module.getServerConfig()).toMatchObject({
      initialized: true,
      apiUrl: "https://api.gradientpeak.app",
      supabaseUrl: "https://db.gradientpeak.app",
      overrideUrl: null,
    });
  });

  it("uses configurable Maestro E2E server defaults", async () => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL = "http://127.0.0.1:3001/";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL = "http://127.0.0.1:55321/";
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(module.getServerConfig()).toMatchObject({
      initialized: true,
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://127.0.0.1:55321",
      overrideUrl: null,
    });
    expect(module.getE2ERuntimeSentinel()).toBe(
      "lane=e2e api=127.0.0.1:3001 supabase=127.0.0.1:55321",
    );
  });

  it("ignores a persisted server override in Maestro E2E mode", async () => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL = "http://127.0.0.1:3001";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL = "http://127.0.0.1:55321";
    const { module, secureStore } = await loadServerConfigModule();
    await secureStore.setItemAsync("server_url_override", "http://127.0.0.1:3000");

    await module.initializeServerConfig();

    expect(module.isServerUrlOverrideEnabled()).toBe(false);
    expect(module.getServerConfig()).toMatchObject({
      initialized: true,
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://127.0.0.1:55321",
      overrideUrl: null,
    });
  });

  it("persists and applies a custom override URL", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    const result = await module.setServerUrlOverride("http://127.0.0.1:3000/");

    expect(result.changed).toBe(true);

    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "http://127.0.0.1:3000",
      supabaseUrl: "http://127.0.0.1:54321",
      overrideUrl: "http://127.0.0.1:3000",
    });
  });

  it("maps the local 3001 API override to local Supabase", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    const result = await module.setServerUrlOverride("http://127.0.0.1:3001/");

    expect(result.changed).toBe(true);

    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "http://127.0.0.1:3001",
      supabaseUrl: "http://127.0.0.1:55321",
      overrideUrl: "http://127.0.0.1:3001",
    });
  });

  it("keeps the hosted Supabase URL for non-local API overrides", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    const result = await module.setServerUrlOverride("https://api.custom.example.com");

    expect(result.changed).toBe(true);

    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "https://api.custom.example.com",
      supabaseUrl: "https://db.gradientpeak.app",
      overrideUrl: "https://api.custom.example.com",
    });
  });

  it("only permits offline read attempts for a sanctioned local development API", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    await module.setServerUrlOverride("http://127.0.0.1:3000");
    expect(module.isLocalDevelopmentApiEndpoint()).toBe(true);

    await module.setServerUrlOverride("https://api.custom.example.com");
    expect(module.isLocalDevelopmentApiEndpoint()).toBe(false);
  });

  it("resolves every cold planned-detail read while offline for a local API", async () => {
    const { module } = await loadServerConfigModule();
    await module.initializeServerConfig();
    await module.setServerUrlOverride("http://127.0.0.1:3000");
    const queryClient = new QueryClient();
    const requests = {
      activityPlan: vi.fn(async () => "activity-plan"),
      plannedSession: vi.fn(async () => "planned-session"),
      profile: vi.fn(async () => "profile"),
    };

    onlineManager.setOnline(false);
    try {
      const networkMode = module.isLocalDevelopmentApiEndpoint() ? "always" : "online";
      await expect(
        Promise.all([
          queryClient.fetchQuery({
            networkMode,
            queryFn: requests.plannedSession,
            queryKey: ["plannedSessions", "getById", "cold"],
            retry: false,
          }),
          queryClient.fetchQuery({
            networkMode,
            queryFn: requests.activityPlan,
            queryKey: ["activityPlans", "getById", "cold"],
            retry: false,
          }),
          queryClient.fetchQuery({
            networkMode,
            queryFn: requests.profile,
            queryKey: ["profiles", "get", "cold"],
            retry: false,
          }),
        ]),
      ).resolves.toEqual(["planned-session", "activity-plan", "profile"]);
      expect(requests.plannedSession).toHaveBeenCalledTimes(1);
      expect(requests.activityPlan).toHaveBeenCalledTimes(1);
      expect(requests.profile).toHaveBeenCalledTimes(1);
    } finally {
      onlineManager.setOnline(true);
      queryClient.clear();
    }
  });

  it("keeps hosted reads paused offline and bounds an unreachable local read", async () => {
    const { module } = await loadServerConfigModule();
    await module.initializeServerConfig();
    const queryClient = new QueryClient();
    const hostedRequest = vi.fn(async () => "unexpected");

    onlineManager.setOnline(false);
    const hostedObserver = new QueryObserver(queryClient, {
      networkMode: module.isLocalDevelopmentApiEndpoint() ? "always" : "online",
      queryFn: hostedRequest,
      queryKey: ["plannedSessions", "getById", "hosted-cold"],
      retry: false,
    });
    const unsubscribe = hostedObserver.subscribe(() => undefined);

    try {
      expect(module.isLocalDevelopmentApiEndpoint()).toBe(false);
      expect(hostedObserver.getCurrentResult()).toMatchObject({
        fetchStatus: "paused",
        isLoading: false,
        isPending: true,
        status: "pending",
      });
      expect(hostedRequest).not.toHaveBeenCalled();

      await module.setServerUrlOverride("http://10.0.2.2:3000");
      const localRequest = vi.fn(async () => {
        throw new Error("local API unavailable");
      });
      await expect(
        queryClient.fetchQuery({
          networkMode: module.isLocalDevelopmentApiEndpoint() ? "always" : "online",
          queryFn: localRequest,
          queryKey: ["plannedSessions", "getById", "local-unreachable"],
          retry: false,
        }),
      ).rejects.toThrow("local API unavailable");
      expect(localRequest).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      onlineManager.setOnline(true);
      queryClient.clear();
    }
  });

  it("rejects malformed URLs", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    await expect(module.setServerUrlOverride("not-a-url")).rejects.toThrow(
      "Please enter a valid URL",
    );
  });

  it("disables stored and new override URLs in production", async () => {
    const { module, secureStore } = await loadServerConfigModule("production");

    await secureStore.setItemAsync("server_url_override", "http://127.0.0.1:3000");
    await module.initializeServerConfig();

    expect(module.isServerUrlOverrideEnabled()).toBe(false);
    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "https://api.gradientpeak.app",
      supabaseUrl: "https://db.gradientpeak.app",
      overrideUrl: null,
    });
    expect(module.getE2ERuntimeSentinel()).toBeNull();
    await expect(module.setServerUrlOverride("http://127.0.0.1:3000")).rejects.toThrow(
      "disabled in production",
    );
  });

  it("allows production overrides only when explicitly enabled by build configuration", async () => {
    const { module, secureStore } = await loadServerConfigModule("production", true);

    await secureStore.setItemAsync("server_url_override", "https://api.custom.example.com");
    await module.initializeServerConfig();

    expect(module.isServerUrlOverrideEnabled()).toBe(true);
    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "https://api.custom.example.com",
      supabaseUrl: "https://db.gradientpeak.app",
      overrideUrl: "https://api.custom.example.com",
    });
  });

  it("does not bump state version when override is unchanged", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    await module.setServerUrlOverride("http://127.0.0.1:3000");
    const afterFirstSet = module.getServerConfig();

    const result = await module.setServerUrlOverride("http://127.0.0.1:3000/");
    const afterSecondSet = module.getServerConfig();

    expect(result.changed).toBe(false);
    expect(afterSecondSet.version).toBe(afterFirstSet.version);
  });

  it("rewrites local signed storage URLs to the reachable hosted supabase origin", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(
      module.getReachableSupabaseStorageUrl(
        "http://127.0.0.1:54321/storage/v1/object/upload/sign/profile-avatars/test.png?token=abc",
      ),
    ).toBe(
      "https://db.gradientpeak.app/storage/v1/object/upload/sign/profile-avatars/test.png?token=abc",
    );
  });

  it("keeps local signed storage URLs when the device is intentionally using local supabase", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    await module.setServerUrlOverride("http://127.0.0.1:3000");

    expect(
      module.getReachableSupabaseStorageUrl(
        "http://127.0.0.1:54321/storage/v1/object/upload/sign/profile-avatars/test.png?token=abc",
      ),
    ).toBe(
      "http://127.0.0.1:54321/storage/v1/object/upload/sign/profile-avatars/test.png?token=abc",
    );
  });

  it("upgrades legacy profile media paths to reachable public URLs", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(module.getReachableSupabaseStorageUrl("user-1/avatar image.jpg")).toBe(
      "https://db.gradientpeak.app/storage/v1/object/public/profile-avatars/user-1/avatar%20image.jpg",
    );
  });

  it("does not upgrade encoded profile media traversal paths", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(module.getReachableSupabaseStorageUrl("user-1/%2e%2e/avatar.jpg")).toBe(
      "user-1/%2e%2e/avatar.jpg",
    );
  });
});
