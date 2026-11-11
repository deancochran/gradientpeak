import { safeSecureStore } from "@/lib/storage/safe-secure-store";
import {
  BETTER_AUTH_SECURE_STORE_BASE_KEYS,
  MAX_BETTER_AUTH_CHUNK_COUNT,
} from "./better-auth-secure-store-adapter";

const AUTH_COOKIE_HEADER_KEY = "gradientpeak.auth.cookie-header";
const BETTER_AUTH_CHUNK_MARKER = "\u0001ba-chunks:";

export const SECURE_AUTH_STORAGE_KEYS = [
  AUTH_COOKIE_HEADER_KEY,
  ...BETTER_AUTH_SECURE_STORE_BASE_KEYS,
] as const;

function parseChunkCount(value: string | null): number | null {
  if (!value?.startsWith(BETTER_AUTH_CHUNK_MARKER)) return null;

  const rawCount = value.slice(BETTER_AUTH_CHUNK_MARKER.length);
  if (!/^[1-9]\d*$/.test(rawCount)) throw new Error("Invalid Better Auth chunk marker");

  const count = Number(rawCount);
  if (!Number.isSafeInteger(count)) throw new Error("Invalid Better Auth chunk marker");
  return count;
}

async function clearBetterAuthStorageBase(baseKey: string): Promise<void> {
  const marker = await safeSecureStore.getItemAsyncOrThrow(baseKey);
  const chunkCount = parseChunkCount(marker);
  // The Expo adapter cannot enumerate keys. A valid marker is authoritative,
  // while a missing base needs a bounded sweep for interrupted writes.
  const sweepCount = chunkCount ?? MAX_BETTER_AUTH_CHUNK_COUNT;

  for (let index = 0; index < sweepCount; index += 1) {
    await safeSecureStore.deleteItemAsyncOrThrow(`${baseKey}.${index}`);
  }
  await safeSecureStore.deleteItemAsyncOrThrow(baseKey);
}

/**
 * Revokes every native auth persistence location for a contract-epoch reset.
 * The cache is cleared before storage work so a partial SecureStore failure
 * cannot leave old credentials available in this process. Storage failures are
 * deliberately propagated: the epoch marker must remain absent and retry.
 */
export async function clearSecureAuthStateForContractEpoch() {
  await safeSecureStore.deleteItemAsyncOrThrow(AUTH_COOKIE_HEADER_KEY);
  for (const key of BETTER_AUTH_SECURE_STORE_BASE_KEYS) {
    await clearBetterAuthStorageBase(key);
  }
}
