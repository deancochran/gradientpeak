import {
  normalizeGradientPeakAuthClientSession,
  resolveGradientPeakAuthBaseUrl,
} from "@repo/auth/client";
import type { AuthSession } from "@repo/auth/session";
import { createGradientPeakWebAuthClient } from "@repo/auth/client/web";

import { getAppBaseUrl } from "../app-url";

export const authClient = createGradientPeakWebAuthClient({
  baseURL: resolveGradientPeakAuthBaseUrl({
    appBaseUrl: getAppBaseUrl(),
  }),
});

export function normalizeWebAuthSession(session: unknown) {
  return normalizeGradientPeakAuthClientSession(session as never, "cookie");
}

export async function getWebAuthSession(): Promise<AuthSession | null> {
  const result = await authClient.getSession();
  return normalizeWebAuthSession(result.data);
}
