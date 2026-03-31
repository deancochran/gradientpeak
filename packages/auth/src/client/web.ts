import { createAuthClient } from "better-auth/react";

export interface CreateGradientPeakWebAuthClientOptions {
  baseURL: string;
}

export function createGradientPeakWebAuthClient(
  options: string | CreateGradientPeakWebAuthClientOptions,
) {
  const baseURL = typeof options === "string" ? options : options.baseURL;

  return createAuthClient({
    baseURL,
  });
}
