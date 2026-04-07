import type { AuthSession, AuthSessionLike, AuthSessionTransport } from "../contracts/session";
import { normalizeAuthSession } from "../contracts/session";

export interface ResolveGradientPeakAuthBaseUrlOptions {
  appBaseUrl: string | URL;
  authPath?: string;
}

export function resolveGradientPeakAuthBaseUrl(
  options: ResolveGradientPeakAuthBaseUrlOptions,
): string {
  return new URL(options.authPath ?? "/api/auth", options.appBaseUrl).toString();
}

export function normalizeGradientPeakAuthClientSession(
  session: AuthSessionLike | null | undefined,
  transport: AuthSessionTransport = "cookie",
): AuthSession | null {
  return normalizeAuthSession(session, transport);
}
