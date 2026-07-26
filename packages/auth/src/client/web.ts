import { createAuthClient } from "better-auth/react";

export interface CreateGradientPeakWebAuthClientOptions {
  baseURL: string;
}

export function createGradientPeakWebAuthClient(options: CreateGradientPeakWebAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
  });
}
