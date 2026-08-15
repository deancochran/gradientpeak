import { CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTRACT_EPOCH_DATABASE_DELETE_TIMEOUT_MS,
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

  it("hard-resets known product persistence and records the epoch last", async () => {
    const localStorage = createStorage({
      [CONTRACT_EPOCH_STORAGE_KEY]: "0",
      "gradientpeak-theme-store": "dark",
      auth_session: "preserved",
    });
    const sessionStorage = createStorage({
      "gradientpeak.recording.instance-id": "tab-1",
      auth_session: "preserved",
    });
    const calls: string[] = [];
    const deleteDatabase = vi.fn(async (name: string) => {
      calls.push(`delete:${name}`);
    });
    localStorage.setItem.mockImplementation((key: string, _value: string) => {
      calls.push(`set:${key}`);
      return undefined;
    });

    await expect(
      ensureCurrentContractEpoch({ localStorage, sessionStorage, deleteDatabase }),
    ).resolves.toBe(true);

    expect(deleteDatabase).toHaveBeenCalledWith(LEGACY_WEB_RECORDING_DATABASE_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(`${WEB_RECORDING_DATABASE_PREFIX}0`);
    expect(deleteDatabase).toHaveBeenCalledWith(WEB_RECORDING_DATABASE_NAME);
    expect(localStorage.removeItem).toHaveBeenCalledWith("gradientpeak-theme-store");
    expect(localStorage.getItem("auth_session")).toBe("preserved");
    expect(sessionStorage.getItem("auth_session")).toBe("preserved");
    expect(calls.at(-1)).toBe(`set:${CONTRACT_EPOCH_STORAGE_KEY}`);
  });

  it("deletes numeric prior-epoch databases when enumeration is unavailable", async () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    const deleteDatabase = vi.fn(async () => undefined);

    await expect(
      ensureCurrentContractEpoch({ localStorage, sessionStorage, deleteDatabase }),
    ).resolves.toBe(true);

    expect(deleteDatabase).toHaveBeenCalledWith(`${WEB_RECORDING_DATABASE_PREFIX}0`);
  });

  it("deletes enumerated preview-epoch databases without touching unrelated storage", async () => {
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

    expect(deleteDatabase).toHaveBeenCalledWith(`${WEB_RECORDING_DATABASE_PREFIX}previous-preview`);
    expect(deleteDatabase).not.toHaveBeenCalledWith("unrelated-database");
  });

  it("does not write the marker when a database deletion is blocked", async () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();

    await expect(
      ensureCurrentContractEpoch({
        localStorage,
        sessionStorage,
        deleteDatabase: vi.fn().mockRejectedValue(new Error("blocked")),
      }),
    ).rejects.toThrow("blocked");

    expect(localStorage.setItem).not.toHaveBeenCalled();
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

  it("rejects when the browser never completes a database deletion", async () => {
    vi.useFakeTimers();
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    const request = {} as IDBOpenDBRequest;
    vi.stubGlobal("window", { localStorage, sessionStorage });
    vi.stubGlobal("indexedDB", {
      deleteDatabase: vi.fn(() => request),
    });

    const bootstrap = ensureCurrentBrowserContractEpoch();
    const rejection = expect(bootstrap).rejects.toThrow(
      `Timed out deleting ${LEGACY_WEB_RECORDING_DATABASE_NAME}`,
    );
    await vi.advanceTimersByTimeAsync(CONTRACT_EPOCH_DATABASE_DELETE_TIMEOUT_MS);
    await rejection;

    expect(localStorage.setItem).not.toHaveBeenCalled();
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
