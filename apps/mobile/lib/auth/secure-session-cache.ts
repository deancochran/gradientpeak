import { safeSecureStore } from "@/lib/storage/safe-secure-store";

const AUTH_COOKIE_HEADER_KEY = "gradientpeak.auth.cookie-header";

let cachedCookieHeader: string | null | undefined;

export function peekCachedAuthCookieHeader() {
  return cachedCookieHeader ?? null;
}

export async function getCachedAuthCookieHeader() {
  if (cachedCookieHeader !== undefined) {
    return cachedCookieHeader;
  }

  cachedCookieHeader = await safeSecureStore.getItemAsync(AUTH_COOKIE_HEADER_KEY);
  return cachedCookieHeader;
}

export async function setCachedAuthCookieHeader(cookieHeader: string | null) {
  cachedCookieHeader = cookieHeader;

  if (cookieHeader) {
    await safeSecureStore.setItemAsync(AUTH_COOKIE_HEADER_KEY, cookieHeader);
    return;
  }

  await safeSecureStore.deleteItemAsync(AUTH_COOKIE_HEADER_KEY);
}

export async function clearCachedAuthCookieHeader() {
  await setCachedAuthCookieHeader(null);
}
