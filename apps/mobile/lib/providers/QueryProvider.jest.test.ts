jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));
jest.mock("@repo/api/react", () => ({ createQueryClient: jest.fn() }));
jest.mock("../api", () => ({ api: { Provider: jest.fn() }, createApiClient: jest.fn() }));
jest.mock("../server-config", () => ({ useServerConfig: jest.fn() }));
jest.mock("../stores/auth-store", () => ({ useAuthStore: { getState: jest.fn() } }));
jest.mock("../testing/e2eRuntimeErrors", () => ({ captureE2EQueryError: jest.fn() }));

import { MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { Alert } from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { captureE2EQueryError } from "../testing/e2eRuntimeErrors";
import { setupCacheErrorHandlers, setupNetworkListener } from "./QueryProvider";

describe("QueryProvider cache error ownership", () => {
  it("captures cache errors without owning user-visible alerts and restores original handlers", () => {
    const originalQueryOnError = jest.fn();
    const originalMutationOnError = jest.fn();
    const queryCache = new QueryCache({ onError: originalQueryOnError });
    const mutationCache = new MutationCache({ onError: originalMutationOnError });
    const queryClient = new QueryClient({ mutationCache, queryCache });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    jest.mocked(useAuthStore.getState).mockReturnValue({ session: null } as never);

    const cleanup = setupCacheErrorHandlers(queryClient);
    const installedQueryOnError = queryCache.config.onError;
    const installedMutationOnError = mutationCache.config.onError;
    const queryError = new Error("Load failed");
    const mutationError = new Error("Save failed");

    installedQueryOnError?.(queryError, {} as never);
    void installedMutationOnError?.(mutationError, undefined, undefined, {} as never, {} as never);

    expect(captureE2EQueryError).toHaveBeenNthCalledWith(1, queryError, "query_cache");
    expect(captureE2EQueryError).toHaveBeenNthCalledWith(2, mutationError, "mutation_cache");
    expect(originalQueryOnError).toHaveBeenCalledWith(queryError, expect.anything());
    expect(originalMutationOnError).toHaveBeenCalledWith(
      mutationError,
      undefined,
      undefined,
      expect.anything(),
      expect.anything(),
    );
    expect(alert).not.toHaveBeenCalled();

    cleanup();

    expect(queryCache.config.onError).toBe(originalQueryOnError);
    expect(mutationCache.config.onError).toBe(originalMutationOnError);
    alert.mockRestore();
  });
});

describe("QueryProvider network setup", () => {
  it("reports a rejected initial lookup and falls back to the live network listener", async () => {
    const error = new Error("Network state unavailable");
    const setOnline = jest.fn();
    const remove = jest.fn();
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const unhandledRejection = jest.fn();
    jest.mocked(Network.getNetworkStateAsync).mockRejectedValueOnce(error);
    jest.mocked(Network.addNetworkStateListener).mockReturnValueOnce({ remove });
    const managerListener = jest
      .spyOn(onlineManager, "setEventListener")
      .mockImplementation((listener) => listener(setOnline));
    process.on("unhandledRejection", unhandledRejection);

    try {
      setupNetworkListener();
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleWarn).toHaveBeenCalledWith(
        "[QueryProvider] Failed to read initial network state; waiting for a network update",
        error,
      );
      expect(setOnline).not.toHaveBeenCalled();
      expect(Network.addNetworkStateListener).toHaveBeenCalledTimes(1);
      expect(unhandledRejection).not.toHaveBeenCalled();

      const networkListener: ((state: Network.NetworkState) => void) | undefined = jest
        .mocked(Network.addNetworkStateListener)
        .mock.calls.at(-1)?.[0];
      networkListener?.({ isConnected: true });
      expect(setOnline).toHaveBeenCalledWith(true);
    } finally {
      process.off("unhandledRejection", unhandledRejection);
      managerListener.mockRestore();
      consoleWarn.mockRestore();
    }
  });
});
