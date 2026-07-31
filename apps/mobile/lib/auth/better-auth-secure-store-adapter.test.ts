import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createBetterAuthSecureStoreAdapter,
  isAllowedBetterAuthSecureStoreWriteKey,
  MAX_BETTER_AUTH_CHUNK_COUNT,
} from "./better-auth-secure-store-adapter";
import { clearSecureAuthStateForContractEpoch } from "./secure-session-cache";

const secureStoreMock = SecureStore as typeof SecureStore & { __store: Map<string, string> };

function createAdapter() {
  return createBetterAuthSecureStoreAdapter({
    getItem: (key) => secureStoreMock.__store.get(key) ?? null,
    setItem: (key, value) => {
      secureStoreMock.__store.set(key, value);
    },
  });
}

describe("Better Auth SecureStore write bound", () => {
  beforeEach(() => {
    secureStoreMock.__store.clear();
  });

  it.each([
    "gradientpeak_cookie",
    "better-auth_session_data",
  ])("bounds oversized chunk writes for current and legacy %s storage", async (baseKey) => {
    const storage = createAdapter();
    storage.setItem(baseKey, "");

    for (let index = 0; index < MAX_BETTER_AUTH_CHUNK_COUNT; index += 1) {
      storage.setItem(`${baseKey}.${index}`, `chunk-${index}`);
    }

    expect(() =>
      storage.setItem(`${baseKey}.${MAX_BETTER_AUTH_CHUNK_COUNT}`, "over-bound"),
    ).toThrow("chunk count exceeds");
    // Better Auth writes its chunk marker only after all chunk writes succeed.
    expect(secureStoreMock.__store.get(baseKey)).toBe("");
    expect(secureStoreMock.__store.has(`${baseKey}.${MAX_BETTER_AUTH_CHUNK_COUNT}`)).toBe(false);

    await clearSecureAuthStateForContractEpoch();

    expect(secureStoreMock.__store.has(baseKey)).toBe(false);
    for (let index = 0; index < MAX_BETTER_AUTH_CHUNK_COUNT; index += 1) {
      expect(secureStoreMock.__store.has(`${baseKey}.${index}`)).toBe(false);
    }
  });

  it("allows base writes and unrelated dotted SecureStore keys", () => {
    const storage = createAdapter();

    storage.setItem("gradientpeak_cookie", "base-value");
    storage.setItem("unrelated.preference.999", "allowed");

    expect(isAllowedBetterAuthSecureStoreWriteKey("gradientpeak_cookie")).toBe(true);
    expect(isAllowedBetterAuthSecureStoreWriteKey("unrelated.preference.999")).toBe(true);
    expect(secureStoreMock.__store.get("gradientpeak_cookie")).toBe("base-value");
    expect(secureStoreMock.__store.get("unrelated.preference.999")).toBe("allowed");
  });
});
