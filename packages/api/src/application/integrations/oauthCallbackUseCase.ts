import type { PublicIntegrationProvider } from "@repo/db";
import { z } from "zod";
import type { DrizzleTransactionClient } from "../../db";
import {
  getProviderOAuthConfig,
  isSupportedOAuthProvider,
} from "../../lib/integrations/oauth-config";
import {
  deriveOAuthCodeVerifier,
  redeemLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import { logger } from "../../lib/logger";
import type { IntegrationsRepositories } from "../../repositories/integrations-repository";
import type { ProviderSyncRepository } from "../../repositories/provider-sync-repository";
import { enqueueActivityHistoryReconcile } from "./syncNowUseCase";
import { supportsActivityHistorySync } from "./syncOverviewUseCase";

export type HandleOAuthCallbackInput = {
  code: string | null;
  error: string | null;
  fallbackRedirect: string;
  provider: string;
  repositories: IntegrationsRepositories;
  providerSyncRepository: ProviderSyncRepository;
  runInTransaction: <T>(
    operation: (transaction: DrizzleTransactionClient) => Promise<T>,
  ) => Promise<T>;
  state: string | null;
};

export type HandleOAuthCallbackResult = { redirectUrl: string; status: 302 };

const providerIdentifierSchema = z.union([z.string(), z.number()]).nullable().optional();
const oauthTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1),
    refresh_token: z.string().trim().min(1).nullable().optional(),
    expires_in: z
      .union([z.number(), z.string().trim().min(1)])
      .pipe(z.coerce.number<string | number>().finite().positive())
      .optional(),
    scope: z.string().nullable().optional(),
    athlete: z.object({ id: providerIdentifierSchema }).passthrough().nullable().optional(),
    user: z.object({ id: providerIdentifierSchema }).passthrough().nullable().optional(),
    userId: providerIdentifierSchema,
    id: providerIdentifierSchema,
  })
  .passthrough();
type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

export class OAuthTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "OAuthTokenExchangeError";
  }
}

function buildRedirectUrl(baseUrl: string, params: Record<string, string | null | undefined>) {
  const redirectUrl = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl.toString();
}

function parseOAuthTokenResponse(value: unknown): OAuthTokenResponse {
  const parsed = oauthTokenResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new OAuthTokenExchangeError("OAuth token response was invalid", "invalid_token_response");
  }
  return parsed.data;
}

async function exchangeCodeForTokens(
  provider: PublicIntegrationProvider,
  code: string,
  state: string,
): Promise<OAuthTokenResponse> {
  const config = getProviderOAuthConfig(provider);
  if (!config)
    throw new OAuthTokenExchangeError("OAuth credentials are not configured", "not_configured");
  const codeVerifier = deriveOAuthCodeVerifier({
    clientSecret: config.clientSecret,
    provider,
    state,
  });
  if (config.adapter === "local-test") {
    try {
      return parseOAuthTokenResponse(
        redeemLocalOAuthAuthorizationCode({ code, config, provider, verifier: codeVerifier }),
      );
    } catch {
      throw new OAuthTokenExchangeError("Local token exchange failed", "invalid_grant");
    }
  }
  const baseUrl =
    process.env.OAUTH_CALLBACK_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: `${baseUrl}/api/integrations/callback/${provider}`,
    }).toString(),
  });
  if (!response.ok) {
    logger.warn("OAuth token exchange failed", { provider, status: response.status });
    throw new OAuthTokenExchangeError("Token exchange failed", `http_${response.status}`);
  }
  return parseOAuthTokenResponse(await response.json());
}

async function resolveExternalId(provider: PublicIntegrationProvider, tokens: OAuthTokenResponse) {
  let externalId =
    tokens.athlete?.id?.toString() ||
    tokens.user?.id?.toString() ||
    tokens.userId?.toString() ||
    tokens.id?.toString() ||
    null;
  if (provider === "wahoo" && !externalId) {
    try {
      const userResponse = await fetch("https://api.wahooligan.com/v1/user", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
      });
      if (userResponse.ok)
        externalId = ((await userResponse.json()) as { id: number }).id.toString();
    } catch (error) {
      logger.warn("Failed to fetch Wahoo user profile", {
        provider,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return externalId || "unknown";
}

export async function handleOAuthCallback({
  code,
  error,
  fallbackRedirect,
  provider,
  repositories,
  providerSyncRepository,
  runInTransaction,
  state,
}: HandleOAuthCallbackInput): Promise<HandleOAuthCallbackResult> {
  if (!isSupportedOAuthProvider(provider)) {
    return {
      redirectUrl: buildRedirectUrl(fallbackRedirect, { error: "invalid_provider" }),
      status: 302,
    };
  }
  if (!state) {
    return {
      redirectUrl: buildRedirectUrl(fallbackRedirect, { error: "missing_state" }),
      status: 302,
    };
  }

  const storedState = await repositories.oauthStates.findValidByState({ now: new Date(), state });
  if (!storedState) {
    return {
      redirectUrl: buildRedirectUrl(fallbackRedirect, { error: "invalid_state" }),
      status: 302,
    };
  }
  const mobileRedirectUri = storedState.mobile_redirect_uri;
  const cleanupState = () => repositories.oauthStates.deleteByState(state);

  if (storedState.provider !== provider) {
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error: "invalid_state" }),
      status: 302,
    };
  }
  if (error) {
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error: "authorization_denied" }),
      status: 302,
    };
  }
  if (!code) {
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error: "missing_code" }),
      status: 302,
    };
  }

  let tokens: OAuthTokenResponse;
  let externalId: string;
  try {
    tokens = await exchangeCodeForTokens(provider, code, state);
    externalId = await resolveExternalId(provider, tokens);
  } catch (caughtError) {
    logger.warn("OAuth callback token exchange failed", {
      provider,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
    });
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, {
        error: "token_exchange_failed",
        integration: "failed",
        provider,
      }),
      status: 302,
    };
  }

  let integration: Awaited<
    ReturnType<IntegrationsRepositories["integrations"]["upsertFromOAuthState"]>
  >;
  try {
    integration = await runInTransaction(async (transaction) => {
      const storedIntegration = await repositories.integrations.upsertFromOAuthStateInTransaction(
        transaction,
        {
          state,
          now: new Date(),
          profileId: storedState.profile_id,
          provider,
          externalId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          scope: tokens.scope || null,
        },
      );
      if (storedIntegration && provider === "wahoo" && supportsActivityHistorySync(provider)) {
        await enqueueActivityHistoryReconcile({
          integrationId: storedIntegration.id,
          profileId: storedState.profile_id,
          provider,
          providerSyncRepository,
          transaction,
          trigger: "connect",
        });
      }
      return storedIntegration;
    });
  } catch (caughtError) {
    logger.warn("OAuth callback credential storage failed", {
      provider,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
    });
    // The provider code has already been redeemed, so this state is terminal even though the
    // connection/job transaction rolled back. Keeping it reusable would violate one-time state.
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, {
        error: "store_integration_failed",
        integration: "failed",
        provider,
      }),
      status: 302,
    };
  }
  if (!integration) {
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error: "invalid_state" }),
      status: 302,
    };
  }
  return {
    redirectUrl: buildRedirectUrl(mobileRedirectUri, {
      integration: "connected",
      provider,
      success: "true",
    }),
    status: 302,
  };
}
