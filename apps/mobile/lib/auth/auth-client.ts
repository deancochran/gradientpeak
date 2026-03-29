import { createGradientPeakExpoAuthClient } from "@repo/auth/expo-client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { getServerConfig } from "@/lib/server-config";

let cachedClient: ReturnType<typeof createGradientPeakExpoAuthClient> | null = null;
let cachedBaseUrl = "";
let cachedScheme = "";

function getAuthBaseUrl() {
  return new URL("/api/auth", getServerConfig().apiUrl).toString();
}

function getExpoScheme() {
  const scheme = Constants.expoConfig?.scheme;
  const normalizedScheme = Array.isArray(scheme) ? scheme[0] : scheme;

  if (!normalizedScheme) {
    throw new Error("Expo scheme is required for Better Auth mobile integration.");
  }

  return normalizedScheme;
}

export function getAuthClient() {
  const baseURL = getAuthBaseUrl();
  const scheme = getExpoScheme();

  if (!cachedClient || cachedBaseUrl !== baseURL || cachedScheme !== scheme) {
    cachedClient = createGradientPeakExpoAuthClient({
      baseURL,
      scheme,
      storagePrefix: "gradientpeak",
      storage: SecureStore,
    });
    cachedBaseUrl = baseURL;
    cachedScheme = scheme;
  }

  return cachedClient;
}
