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
    process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL = "http://127.0.0.1:3100/";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL = "http://127.0.0.1:55321/";
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();

    expect(module.getServerConfig()).toMatchObject({
      initialized: true,
      apiUrl: "http://127.0.0.1:3100",
      supabaseUrl: "http://127.0.0.1:55321",
      overrideUrl: null,
    });
    expect(module.getE2ERuntimeSentinel()).toBe(
      "lane=e2e api=127.0.0.1:3100 supabase=127.0.0.1:55321",
    );
  });

  it("ignores a persisted server override in Maestro E2E mode", async () => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_API_URL = "http://127.0.0.1:3100";
    process.env.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL = "http://127.0.0.1:55321";
    const { module, secureStore } = await loadServerConfigModule();
    await secureStore.setItemAsync("server_url_override", "http://127.0.0.1:3000");

    await module.initializeServerConfig();

    expect(module.isServerUrlOverrideEnabled()).toBe(false);
    expect(module.getServerConfig()).toMatchObject({
      initialized: true,
      apiUrl: "http://127.0.0.1:3100",
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

  it("maps the local 3100 API override to local Supabase", async () => {
    const { module } = await loadServerConfigModule();

    await module.initializeServerConfig();
    const result = await module.setServerUrlOverride("http://127.0.0.1:3100/");

    expect(result.changed).toBe(true);

    expect(module.getServerConfig()).toMatchObject({
      apiUrl: "http://127.0.0.1:3100",
      supabaseUrl: "http://127.0.0.1:55321",
      overrideUrl: "http://127.0.0.1:3100",
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
});
