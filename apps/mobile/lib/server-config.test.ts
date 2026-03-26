import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadServerConfigModule() {
  vi.resetModules();
  process.env.EXPO_PUBLIC_API_URL = "https://api.gradientpeak.app";
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://db.gradientpeak.app";

  const secureStore = await import("expo-secure-store");
  (secureStore as any).__store.clear();

  const module = await import("./server-config");
  return { module, secureStore };
}

describe("server-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
