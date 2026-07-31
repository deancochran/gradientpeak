export const BETTER_AUTH_SECURE_STORE_BASE_KEYS = [
  "gradientpeak_cookie",
  "gradientpeak_session_data",
  "better-auth_cookie",
  "better-auth_session_data",
] as const;

// Match the epoch reset's torn-write sweep. Better Auth commits its base marker
// only after every chunk is written, so rejecting the next chunk leaves an
// unreadable base instead of persistence beyond reset's reachable range.
export const MAX_BETTER_AUTH_CHUNK_COUNT = 32;

type BetterAuthSecureStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isAllowedBetterAuthSecureStoreWriteKey(key: string): boolean {
  for (const baseKey of BETTER_AUTH_SECURE_STORE_BASE_KEYS) {
    const prefix = `${baseKey}.`;
    if (!key.startsWith(prefix)) continue;

    const rawIndex = key.slice(prefix.length);
    if (!/^\d+$/.test(rawIndex)) return true;

    const index = Number(rawIndex);
    return Number.isSafeInteger(index) && index >= 0 && index < MAX_BETTER_AUTH_CHUNK_COUNT;
  }

  return true;
}

export function createBetterAuthSecureStoreAdapter(
  storage: BetterAuthSecureStore,
): BetterAuthSecureStore {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (!isAllowedBetterAuthSecureStoreWriteKey(key)) {
        throw new Error("Better Auth SecureStore chunk count exceeds the supported reset sweep");
      }
      storage.setItem(key, value);
    },
  };
}
