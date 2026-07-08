import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

type AuthClientPlugin = NonNullable<
  NonNullable<Parameters<typeof createAuthClient>[0]>["plugins"]
>[number];

export interface CreateGradientPeakExpoAuthClientOptions {
  baseURL: string;
  scheme: string;
  storagePrefix?: string;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

export function createGradientPeakExpoAuthClient(options: CreateGradientPeakExpoAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    disableDefaultFetchPlugins: true,
    plugins: [
      expoClient({
        scheme: options.scheme,
        storagePrefix: options.storagePrefix,
        storage: options.storage as any,
      }) as unknown as AuthClientPlugin,
    ],
  });
}
