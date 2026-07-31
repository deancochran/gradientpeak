import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

type AuthClientPlugin = NonNullable<
  NonNullable<Parameters<typeof createAuthClient>[0]>["plugins"]
>[number];
type ExpoClientOptions = Parameters<typeof expoClient>[0];

function readUnknownProperty(target: object, key: PropertyKey): unknown {
  return Reflect.get(target, key);
}

function adaptExpoClientPlugin(plugin: ReturnType<typeof expoClient>): AuthClientPlugin {
  const getActions = readUnknownProperty(plugin, "getActions");
  const fetchPlugins = readUnknownProperty(plugin, "fetchPlugins");
  if (typeof getActions !== "function" || !Array.isArray(fetchPlugins)) {
    throw new Error("Better Auth Expo client plugin shape is unsupported");
  }

  return {
    id: plugin.id,
    version: plugin.version,
    getActions: (fetch, store, options) =>
      Reflect.apply(getActions, plugin, [fetch, store, options]),
    fetchPlugins,
  };
}

export interface CreateGradientPeakExpoAuthClientOptions {
  baseURL: string;
  scheme: string;
  storagePrefix?: string;
  fixedHeaders?: Readonly<Record<string, string>>;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

export function createGradientPeakExpoAuthClient(options: CreateGradientPeakExpoAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    disableDefaultFetchPlugins: true,
    ...(options.fixedHeaders ? { fetchOptions: { headers: options.fixedHeaders } } : {}),
    plugins: [
      adaptExpoClientPlugin(
        expoClient({
          scheme: options.scheme,
          storagePrefix: options.storagePrefix,
          storage: options.storage as ExpoClientOptions["storage"],
        }),
      ),
    ],
  });
}
