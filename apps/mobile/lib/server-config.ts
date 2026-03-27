import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

const SERVER_URL_OVERRIDE_KEY = "server_url_override";
const useLocalE2EHost = process.env.EXPO_PUBLIC_MAESTRO_E2E === "1";

const hostedApiUrl = useLocalE2EHost
  ? "http://127.0.0.1:3000"
  : requireUrl(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
const hostedSupabaseUrl = useLocalE2EHost
  ? "http://127.0.0.1:54321"
  : requireUrl(process.env.EXPO_PUBLIC_SUPABASE_URL, "EXPO_PUBLIC_SUPABASE_URL");

type ServerConfigState = {
  initialized: boolean;
  version: number;
  apiUrl: string;
  supabaseUrl: string;
  overrideUrl: string | null;
};

let state: ServerConfigState = {
  initialized: false,
  version: 0,
  apiUrl: hostedApiUrl,
  supabaseUrl: hostedSupabaseUrl,
  overrideUrl: null,
};

const listeners = new Set<() => void>();
let initializePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeBaseUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol.startsWith("http")) {
      return null;
    }

    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    const path = normalizedPath === "/" ? "" : normalizedPath;
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}

function requireUrl(value: string | undefined, name: string): string {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }

  return normalized;
}

function deriveSupabaseUrl(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    const isLocalHost = ["127.0.0.1", "localhost", "10.0.2.2"].includes(parsed.hostname);
    if (isLocalHost && ["3000", "3100"].includes(parsed.port)) {
      parsed.port = "54321";
      parsed.pathname = "";
      return parsed.origin;
    }

    return hostedSupabaseUrl;
  } catch {
    return hostedSupabaseUrl;
  }
}

function updateState(overrideUrl: string | null) {
  const nextApiUrl = overrideUrl ?? hostedApiUrl;
  const nextSupabaseUrl = overrideUrl ? deriveSupabaseUrl(nextApiUrl) : hostedSupabaseUrl;

  state = {
    initialized: true,
    version: state.version + 1,
    apiUrl: nextApiUrl,
    supabaseUrl: nextSupabaseUrl,
    overrideUrl,
  };

  emit();
}

export async function initializeServerConfig() {
  if (state.initialized) {
    return;
  }

  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    const storedUrl = await SecureStore.getItemAsync(SERVER_URL_OVERRIDE_KEY);
    const normalizedOverride = normalizeBaseUrl(storedUrl);
    updateState(normalizedOverride);
  })();

  try {
    await initializePromise;
  } finally {
    initializePromise = null;
  }
}

export async function setServerUrlOverride(url: string | null) {
  const normalizedOverride = normalizeBaseUrl(url);

  if (url && !normalizedOverride) {
    throw new Error("Please enter a valid URL (include http:// or https://)");
  }

  if (normalizedOverride === state.overrideUrl) {
    return { changed: false as const };
  }

  if (!normalizedOverride) {
    await SecureStore.deleteItemAsync(SERVER_URL_OVERRIDE_KEY);
    updateState(null);
    return { changed: true as const };
  }

  await SecureStore.setItemAsync(SERVER_URL_OVERRIDE_KEY, normalizedOverride);
  updateState(normalizedOverride);
  return { changed: true as const };
}

export function getServerConfig() {
  return state;
}

export function getHostedApiUrl() {
  return hostedApiUrl;
}

export function subscribeServerConfig(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useServerConfig() {
  return useSyncExternalStore(subscribeServerConfig, getServerConfig);
}
