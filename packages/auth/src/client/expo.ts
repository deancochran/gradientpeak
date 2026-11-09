import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";

export interface CreateGradientPeakExpoAuthClientOptions {
  baseURL: string;
  scheme: string;
  storagePrefix?: string;
  fixedHeaders?: Readonly<Record<string, string>>;
  storage: {
    getItem(key: string): string | null;
    getItemAsync(key: string): Promise<string | null>;
    setItem(key: string, value: string): void;
    setItemAsync(key: string, value: string): Promise<void>;
  };
}

export function createGradientPeakExpoAuthClient(options: CreateGradientPeakExpoAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    disableDefaultFetchPlugins: true,
    ...(options.fixedHeaders ? { fetchOptions: { headers: options.fixedHeaders } } : {}),
    plugins: [
      expoClient({
        scheme: options.scheme,
        storagePrefix: options.storagePrefix,
        storage: options.storage,
      }),
    ],
  });
}
