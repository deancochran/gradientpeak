import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";
import {
  normalizeGradientPeakAuthClientSession,
  resolveGradientPeakAuthBaseUrl,
} from "@repo/auth/client";
import { createGradientPeakWebAuthClient } from "@repo/auth/client/web";
import type { AuthSession } from "@repo/auth/session";

import { getAppBaseUrl } from "../app-url";

export const authClient = createGradientPeakWebAuthClient({
  baseURL: resolveGradientPeakAuthBaseUrl({
    appBaseUrl: getAppBaseUrl(),
  }),
  fixedHeaders: {
    [CONTRACT_EPOCH_HEADER]: String(CURRENT_CONTRACT_EPOCH),
  },
});

export function normalizeWebAuthSession(session: unknown) {
  return normalizeGradientPeakAuthClientSession(session as never, "cookie");
}

export async function getWebAuthSession(): Promise<AuthSession | null> {
  const result = await authClient.getSession();
  return normalizeWebAuthSession(result.data);
}
