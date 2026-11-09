import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAuthClient, expoClient } = vi.hoisted(() => ({
  createAuthClient: vi.fn(),
  expoClient: vi.fn(() => ({
    id: "expo" as const,
    version: "test",
    getActions: vi.fn(() => ({ getCookie: vi.fn() })),
    fetchPlugins: [],
  })),
}));

vi.mock("better-auth/react", () => ({ createAuthClient }));
vi.mock("@better-auth/expo/client", () => ({ expoClient }));

import { createGradientPeakExpoAuthClient } from "./expo";
import { createGradientPeakWebAuthClient } from "./web";

describe("GradientPeak auth clients", () => {
  beforeEach(() => {
    createAuthClient.mockReset();
    expoClient.mockClear();
  });

  it("configures fixed headers for every web auth request", () => {
    createGradientPeakWebAuthClient({
      baseURL: "https://app.example.test/api/auth",
      fixedHeaders: { "x-gradientpeak-contract-epoch": "1" },
    });

    expect(createAuthClient).toHaveBeenCalledWith({
      baseURL: "https://app.example.test/api/auth",
      fetchOptions: { headers: { "x-gradientpeak-contract-epoch": "1" } },
    });
  });

  it("configures fixed headers without changing Expo storage semantics", () => {
    const storage = {
      getItem: vi.fn(),
      getItemAsync: vi.fn(),
      setItem: vi.fn(),
      setItemAsync: vi.fn(),
    };
    createGradientPeakExpoAuthClient({
      baseURL: "https://app.example.test/api/auth",
      scheme: "gradientpeak",
      storagePrefix: "gradientpeak",
      fixedHeaders: { "x-gradientpeak-contract-epoch": "1" },
      storage,
    });

    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://app.example.test/api/auth",
        fetchOptions: { headers: { "x-gradientpeak-contract-epoch": "1" } },
      }),
    );
    expect(expoClient).toHaveBeenCalledWith({
      scheme: "gradientpeak",
      storagePrefix: "gradientpeak",
      storage,
    });
  });
});
