import { createAuthClient } from "better-auth/react";

export function createGradientPeakWebAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
  });
}
