import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSecureAuthStateForContractEpoch,
  SECURE_AUTH_STORAGE_KEYS,
} from "./secure-session-cache";

const secureStoreMock = SecureStore as typeof SecureStore & {
  __store: Map<string, string>;
};

describe("contract-epoch secure auth cleanup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secureStoreMock.__store.clear();
  });

  it("removes every native auth base key while preserving unrelated SecureStore values", async () => {
    for (const key of SECURE_AUTH_STORAGE_KEYS) secureStoreMock.__store.set(key, "old-auth");
    secureStoreMock.__store.set("server-url-override", "preserved");

    await clearSecureAuthStateForContractEpoch();

    for (const key of SECURE_AUTH_STORAGE_KEYS) {
      expect(secureStoreMock.__store.get(key)).toBeUndefined();
    }
    expect(secureStoreMock.__store.get("server-url-override")).toBe("preserved");
  });

  it.each([
    "gradientpeak_cookie",
    "better-auth_session_data",
  ])("removes every declared chunk for current and legacy %s values", async (baseKey) => {
    secureStoreMock.__store.set(baseKey, "\u0001ba-chunks:33");
    secureStoreMock.__store.set(`${baseKey}.0`, "credential-one");
    secureStoreMock.__store.set(`${baseKey}.32`, "credential-thirty-three");

    await clearSecureAuthStateForContractEpoch();

    expect(secureStoreMock.__store.has(baseKey)).toBe(false);
    expect(secureStoreMock.__store.has(`${baseKey}.0`)).toBe(false);
    expect(secureStoreMock.__store.has(`${baseKey}.32`)).toBe(false);
  });

  it("removes torn chunks when the base marker is absent", async () => {
    secureStoreMock.__store.set("gradientpeak_session_data.0", "old-session");

    await clearSecureAuthStateForContractEpoch();

    expect(secureStoreMock.__store.has("gradientpeak_session_data.0")).toBe(false);
  });

  it.each([
    "\u0001ba-chunks:not-a-count",
    "\u0001ba-chunks:999999999999999999999999",
  ])("fails closed for malformed or huge chunk marker %s", async (marker) => {
    secureStoreMock.__store.set("gradientpeak_cookie", marker);
    secureStoreMock.__store.set("gradientpeak_cookie.0", "old-cookie");

    await expect(clearSecureAuthStateForContractEpoch()).rejects.toThrow(
      "Invalid Better Auth chunk marker",
    );
    expect(secureStoreMock.__store.has("gradientpeak_cookie")).toBe(true);
  });
  it("propagates a deletion failure", async () => {
    vi.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("locked"));

    await expect(clearSecureAuthStateForContractEpoch()).rejects.toThrow("locked");
  });
});
