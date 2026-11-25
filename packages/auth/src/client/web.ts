import { createAuthClient } from "better-auth/react";

export interface CreateGradientPeakWebAuthClientOptions {
  baseURL: string;
  fixedHeaders?: Readonly<Record<string, string>>;
}

export function createGradientPeakWebAuthClient(options: CreateGradientPeakWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    ...(options.fixedHeaders ? { fetchOptions: { headers: options.fixedHeaders } } : {}),
  });
}
