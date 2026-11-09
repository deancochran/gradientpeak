import { CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTRACT_EPOCH_RECORDING_RECOVERY_KEY,
  CONTRACT_EPOCH_RESET_TIMEOUT_MS,
  CONTRACT_EPOCH_STORAGE_KEY,
  ensureCurrentBrowserContractEpoch,
  ensureCurrentContractEpoch,
  LEGACY_WEB_RECORDING_DATABASE_NAME,
  WEB_RECORDING_DATABASE_NAME,
  WEB_RECORDING_DATABASE_PREFIX,
} from "./contract-epoch";

function createStorage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ensureCurrentContractEpoch", () => {
  it("does nothing when the browser already has the current epoch", async () => {
    const localStorage = createStorage({
      [CONTRACT_EPOCH_STORAGE_KEY]: String(CURRENT_CONTRACT_EPOCH),
    });
    const sessionStorage = createStorage();
    const deleteDatabase = vi.fn();

    await expect(
      ensureCurrentContractEpoch({ localStorage, sessionStorage, deleteDatabase }),
    ).resolves.toBe(false);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("resets safe browser state without deleting recorder databases or tab ownership", async () => {
    const localStorage = createStorage({
      [CONTRACT_EPOCH_STORAGE_KEY]: "0",
      "gradientpeak-theme-store": "dark",
      auth_session: "preserved",
    });
    const sessionStorage = createStorage({
      "gradientpeak.recording.instance-id": "tab-1",
      auth_session: "preserved",
    });
    const deleteDatabase = vi.fn(async () => undefined);

    await expect(
      ensureCurrentContractEpoch({
        localStorage,
        sessionStorage,
        deleteDatabase,
        listDatabaseNames: async () => [
          LEGACY_WEB_RECORDING_DATABASE_NAME,
          `${WEB_RECORDING_DATABASE_PREFIX}0`,
          WEB_RECORDING_DATABASE_NAME,
        ],
      }),
    ).resolves.toBe(true);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(localStorage.removeItem).toHaveBeenCalledWith("gradientpeak-theme-store");
    expect(sessionStorage.removeItem).not.toHaveBeenCalledWith(
      "gradientpeak.recording.instance-id",
    );
    expect(sessionStorage.getItem("gradientpeak.recording.instance-id")).toBe("tab-1");
    expect(localStorage.getItem("auth_session")).toBe("preserved");
    expect(sessionStorage.getItem("auth_session")).toBe("preserved");
    expect(
      JSON.parse(localStorage.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY) ?? "null"),
    ).toEqual({
      previousEpoch: "0",
      detection: "detected",
      detectedDatabaseNames: [
        LEGACY_WEB_RECORDING_DATABASE_NAME,
        `${WEB_RECORDING_DATABASE_PREFIX}0`,
        WEB_RECORDING_DATABASE_NAME,
      ],
    });
    expect(localStorage.setItem.mock.calls.at(-1)?.[0]).toBe(CONTRACT_EPOCH_STORAGE_KEY);
  });

  it("preserves possible prior-epoch recording data when enumeration is unavailable", async () => {
    const localStorage = createStorage({ [CONTRACT_EPOCH_STORAGE_KEY]: "0" });
    const sessionStorage = createStorage();
    const deleteDatabase = vi.fn(async () => undefined);

    await expect(
      ensureCurrentContractEpoch({ localStorage, sessionStorage, deleteDatabase }),
    ).resolves.toBe(true);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY) ?? "null"),
    ).toEqual({
      previousEpoch: "0",
      detection: "unknown",
      detectedDatabaseNames: [],
    });
  });

  it("preserves enumerated preview-epoch databases and ignores unrelated storage", async () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    const deleteDatabase = vi.fn(async () => undefined);
    const listDatabaseNames = vi.fn(async () => [
      `${WEB_RECORDING_DATABASE_PREFIX}previous-preview`,
      WEB_RECORDING_DATABASE_NAME,
      "unrelated-database",
    ]);

    await expect(
      ensureCurrentContractEpoch({
        localStorage,
        sessionStorage,
        deleteDatabase,
        listDatabaseNames,
      }),
    ).resolves.toBe(true);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalledWith("unrelated-database");
    expect(localStorage.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY)).toContain(
      `${WEB_RECORDING_DATABASE_PREFIX}previous-preview`,
    );
  });

  it("preserves queued saves in the current recorder database on epoch mismatch", async () => {
    const localStorage = createStorage({ [CONTRACT_EPOCH_STORAGE_KEY]: "0" });
    const sessionStorage = createStorage();
    const deleteDatabase = vi.fn();

    await expect(
      ensureCurrentContractEpoch({
        localStorage,
        sessionStorage,
        deleteDatabase,
        listDatabaseNames: async () => [WEB_RECORDING_DATABASE_NAME],
      }),
    ).resolves.toBe(true);

    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(localStorage.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY)).toContain(
      WEB_RECORDING_DATABASE_NAME,
    );
  });

  it("turns unavailable browser storage into a rejected bootstrap promise", async () => {
    const storageError = new Error("Storage is unavailable.");
    const browserWindow = {};
    Object.defineProperty(browserWindow, "localStorage", {
      get: () => {
        throw storageError;
      },
    });
    vi.stubGlobal("window", browserWindow);

    let bootstrap: Promise<boolean> | undefined;
    expect(() => {
      bootstrap = ensureCurrentBrowserContractEpoch();
    }).not.toThrow();
    await expect(bootstrap).rejects.toBe(storageError);
  });

  it("bounds the entire reset when listing browser databases never completes", async () => {
    vi.useFakeTimers();
    const localStorage = createStorage();
    const sessionStorage = createStorage();

    const reset = ensureCurrentContractEpoch({
      localStorage,
      sessionStorage,
      deleteDatabase: vi.fn(),
      listDatabaseNames: vi.fn(() => new Promise<readonly string[]>(() => undefined)),
    });

    const rejection = expect(reset).rejects.toThrow("Timed out checking local browser data.");
    await vi.advanceTimersByTimeAsync(CONTRACT_EPOCH_RESET_TIMEOUT_MS);
    await rejection;

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
