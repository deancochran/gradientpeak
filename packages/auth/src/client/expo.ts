import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

export interface CreateGradientPeakExpoAuthClientOptions {
  baseURL: string;
  scheme: string;
  storagePrefix?: string;
  storage: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
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
      }),
    ],
  });
}
