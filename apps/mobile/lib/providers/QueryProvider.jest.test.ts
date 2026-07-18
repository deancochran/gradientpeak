jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));
jest.mock("@repo/api/react", () => ({ createQueryClient: jest.fn() }));
jest.mock("../api", () => ({ api: { Provider: jest.fn() }, createApiClient: jest.fn() }));
jest.mock("../server-config", () => ({ useServerConfig: jest.fn() }));
jest.mock("../stores/auth-store", () => ({ useAuthStore: { getState: jest.fn() } }));
jest.mock("../testing/e2eRuntimeErrors", () => ({ captureE2EQueryError: jest.fn() }));

import { onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { setupNetworkListener } from "./QueryProvider";

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
