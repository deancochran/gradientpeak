import { createHash } from "node:crypto";
import type { PublicIntegrationProvider } from "@repo/db";
import type { ResolvedWahooOAuthConfig } from "./oauth-config";
import { deriveOAuthCodeVerifier } from "./oauth-pkce";

export function getOAuthCallbackUrl(provider: PublicIntegrationProvider): string {
  const baseUrl =
    process.env.OAUTH_CALLBACK_BASE_URL || process.env.APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/integrations/callback/${provider}`;
}

export function normalizeOAuthScopes(scopes: readonly string[]): string {
  return [...new Set(scopes.flatMap((scope) => scope.trim().split(/\s+/)).filter(Boolean))]
    .sort()
    .join(" ");
}

export function createOAuthStateBinding(input: {
  config: ResolvedWahooOAuthConfig;
  provider: PublicIntegrationProvider;
  state: string;
}) {
  const verifier = deriveOAuthCodeVerifier({
    clientSecret: input.config.clientSecret,
    provider: input.provider,
    state: input.state,
  });
  return {
    callbackUri: getOAuthCallbackUrl(input.provider),
    requestedScope: normalizeOAuthScopes(input.config.scopes),
    verifierHash: createHash("sha256").update(verifier).digest("hex"),
  };
}
