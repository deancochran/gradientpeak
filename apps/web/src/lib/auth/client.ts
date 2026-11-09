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

export class SessionUnavailableError extends Error {
  constructor() {
    super("Session availability could not be confirmed.");
    this.name = "SessionUnavailableError";
  }
}

export async function getWebAuthSession(): Promise<AuthSession | null> {
  try {
    const result = await authClient.getSession();
    if (result.error) throw new SessionUnavailableError();
    return normalizeWebAuthSession(result.data);
  } catch (error) {
    if (error instanceof SessionUnavailableError) throw error;
    throw new SessionUnavailableError();
  }
}
