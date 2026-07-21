import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { PublicIntegrationProvider } from "@repo/db";

import type { ResolvedProviderOAuthConfig } from "./oauth-config";

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function deriveOAuthCodeVerifier(input: {
  clientSecret: string;
  provider: PublicIntegrationProvider;
  state: string;
}): string {
  return base64Url(
    createHmac("sha256", input.clientSecret)
      .update(`gradientpeak:oauth-pkce:v1:${input.provider}:${input.state}`)
      .digest(),
  );
}

export function createOAuthCodeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

type LocalAuthorizationCode = {
  challenge: string;
  expiresAt: number;
  provider: PublicIntegrationProvider;
  scope: string;
};

function signLocalPayload(payload: string, secret: string): string {
  return base64Url(createHmac("sha256", secret).update(payload).digest());
}

export function issueLocalOAuthAuthorizationCode(input: {
  challenge: string;
  config: ResolvedProviderOAuthConfig;
  now?: number;
  provider: PublicIntegrationProvider;
}): string {
  if (input.config.adapter !== "local-test") {
    throw new Error("Local OAuth codes require the local test adapter");
  }

  const payload = base64Url(
    Buffer.from(
      JSON.stringify({
        challenge: input.challenge,
        expiresAt: (input.now ?? Date.now()) + 5 * 60 * 1000,
        provider: input.provider,
        scope: input.config.scopes.join(" "),
      } satisfies LocalAuthorizationCode),
    ),
  );
  return `${payload}.${signLocalPayload(payload, input.config.clientSecret)}`;
}

export function redeemLocalOAuthAuthorizationCode(input: {
  code: string;
  config: ResolvedProviderOAuthConfig;
  now?: number;
  provider: PublicIntegrationProvider;
  verifier: string;
}): {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userId: string;
} {
  if (input.config.adapter !== "local-test") {
    throw new Error("Local OAuth codes require the local test adapter");
  }

  const [payload, suppliedSignature, extra] = input.code.split(".");
  if (!payload || !suppliedSignature || extra) throw new Error("invalid_local_code");

  const expectedSignature = signLocalPayload(payload, input.config.clientSecret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("invalid_local_code");
  }

  let decoded: LocalAuthorizationCode;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid_local_code");
  }

  if (
    decoded.provider !== input.provider ||
    decoded.expiresAt <= (input.now ?? Date.now()) ||
    decoded.challenge !== createOAuthCodeChallenge(input.verifier)
  ) {
    throw new Error("invalid_local_code");
  }

  return {
    access_token: "local-test-access-token",
    expires_in: 3600,
    refresh_token: "local-test-refresh-token",
    scope: decoded.scope,
    userId: "local-test-provider-user",
  };
}
