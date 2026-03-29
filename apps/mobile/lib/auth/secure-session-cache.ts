import * as SecureStore from "expo-secure-store";

const AUTH_COOKIE_HEADER_KEY = "gradientpeak.auth.cookie-header";

let cachedCookieHeader: string | null | undefined;

export function peekCachedAuthCookieHeader() {
  return cachedCookieHeader ?? null;
}

export async function getCachedAuthCookieHeader() {
  if (cachedCookieHeader !== undefined) {
    return cachedCookieHeader;
  }

  cachedCookieHeader = await SecureStore.getItemAsync(AUTH_COOKIE_HEADER_KEY);
  return cachedCookieHeader;
}

export async function setCachedAuthCookieHeader(cookieHeader: string | null) {
  cachedCookieHeader = cookieHeader;

  if (cookieHeader) {
    await SecureStore.setItemAsync(AUTH_COOKIE_HEADER_KEY, cookieHeader);
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_COOKIE_HEADER_KEY);
}

export async function clearCachedAuthCookieHeader() {
  await setCachedAuthCookieHeader(null);
}
