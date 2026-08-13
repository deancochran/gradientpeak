import type { PublicIntegrationProvider } from "@repo/db";
import { z } from "zod";
import type { DrizzleTransactionClient } from "../../db";
import { getWahooOAuthConfig, isSupportedOAuthProvider } from "../../lib/integrations/oauth-config";
import {
  deriveOAuthCodeVerifier,
  redeemLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import { createOAuthStateBinding } from "../../lib/integrations/oauth-state-binding";
import { isWahooTokenLimitRejection } from "../../lib/integrations/wahoo/oauth-errors";
import { logger } from "../../lib/logger";
import {
  IntegrationDisconnectPendingError,
  IntegrationLifecycleChangedError,
  type IntegrationsRepositories,
  type OAuthIntegrationExpectation,
} from "../../repositories/integrations-repository";
import type { WahooSyncRepository } from "../../repositories/wahoo-sync-repository";
import { getProviderOperationAdapter } from "./provider-operation-runtime";

export type HandleOAuthCallbackInput = {
  db?: import("@repo/db").DrizzleDbClient;
  code: string | null;
  error: string | null;
  fallbackRedirect: string;
  provider: string;
  repositories: IntegrationsRepositories;
  providerSyncRepository: WahooSyncRepository;
  runInTransaction: <T>(
    operation: (transaction: DrizzleTransactionClient) => Promise<T>,
  ) => Promise<T>;
  state: string | null;
};

export type HandleOAuthCallbackResult = { redirectUrl: string; status: 302 };

const providerIdentifierSchema = z
  .union([z.string().trim().min(1), z.number().finite().int()])
  .nullable()
  .optional();
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
export type ProviderOAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

const oauthRejectionSchema = z
  .object({
    error: z.string().trim().min(1).max(96).optional(),
    error_description: z.string().trim().min(1).max(512).optional(),
  })
  .passthrough();

async function classifyOAuthRejection(
  response: Response,
  provider: PublicIntegrationProvider,
): Promise<string> {
  const fallback = `http_${response.status}`;
  try {
    const rawBody = (await response.text()).slice(0, 2048);
    if (!rawBody) return fallback;

    let value: unknown;
    try {
      value = JSON.parse(rawBody);
    } catch {
      const form = new URLSearchParams(rawBody);
      value = {
        error: form.get("error") ?? undefined,
        error_description: form.get("error_description") ?? undefined,
      };
    }

    const rejection = oauthRejectionSchema.safeParse(value);
    if (!rejection.success) return fallback;
    if (
      provider === "wahoo" &&
      isWahooTokenLimitRejection(rejection.data.error, rejection.data.error_description)
    ) {
      return "wahoo_token_limit_exceeded";
    }

    const safeCode = rejection.data.error?.toLowerCase();
    return safeCode && /^[a-z0-9_.-]+$/.test(safeCode) ? safeCode : fallback;
  } catch {
    return fallback;
  }
}

export class OAuthTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "OAuthTokenExchangeError";
  }
}

export class OAuthProviderIdentityError extends Error {
  constructor() {
    super("Provider account identity could not be verified");
    this.name = "OAuthProviderIdentityError";
  }
}

function buildRedirectUrl(baseUrl: string, params: Record<string, string | null | undefined>) {
  const redirectUrl = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl.toString();
}

function parseOAuthTokenResponse(value: unknown): ProviderOAuthTokenResponse {
  const parsed = oauthTokenResponseSchema.safeParse(value);
  if (!parsed.success) {
    const hasMalformedProviderIdentifier = parsed.error.issues.some((issue) =>
      ["athlete", "user", "userId", "id"].includes(String(issue.path[0])),
    );
    if (hasMalformedProviderIdentifier) throw new OAuthProviderIdentityError();
    throw new OAuthTokenExchangeError("OAuth token response was invalid", "invalid_token_response");
  }
  return parsed.data;
}

export async function exchangeWahooOAuthCode(
  provider: PublicIntegrationProvider,
  code: string,
  state: string,
): Promise<ProviderOAuthTokenResponse> {
  const config = provider === "wahoo" ? getWahooOAuthConfig() : null;
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
    process.env.OAUTH_CALLBACK_BASE_URL || process.env.APP_URL || "http://localhost:3000";
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: `${baseUrl}/api/integrations/callback/${provider}`,
  });
  if (config.pkce) body.set("code_verifier", codeVerifier);
  if (config.tokenClientAuthentication === "client_secret_post") {
    body.set("client_secret", config.clientSecret);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.tokenClientAuthentication === "client_secret_basic") {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!response.ok) {
    const reason = await classifyOAuthRejection(response, provider);
    logger.warn("OAuth token exchange failed", { provider, reason, status: response.status });
    throw new OAuthTokenExchangeError("Token exchange failed", reason);
  }
  return parseOAuthTokenResponse(await response.json());
}

function resolveTokenExternalId(tokens: ProviderOAuthTokenResponse): string | null {
  const externalId =
    tokens.athlete?.id?.toString() ||
    tokens.user?.id?.toString() ||
    tokens.userId?.toString() ||
    tokens.id?.toString() ||
    null;
  return externalId;
}

const wahooUserProfileSchema = z.object({ id: providerIdentifierSchema }).passthrough();

export async function resolveWahooOAuthIdentity(
  provider: PublicIntegrationProvider,
  tokens: ProviderOAuthTokenResponse,
): Promise<{ externalId: string; requiresActivation: boolean }> {
  const tokenExternalId = resolveTokenExternalId(tokens);
  const config = provider === "wahoo" ? getWahooOAuthConfig() : null;
  if (provider !== "wahoo" || config?.adapter === "local-test") {
    if (tokenExternalId) return { externalId: tokenExternalId, requiresActivation: false };
    throw new OAuthProviderIdentityError();
  }

  // Store identity-bearing Wahoo tokens before their first API call. If activation is temporarily
  // unavailable, the queued history job can retry with this same durable token instead of forcing
  // another authorization-code exchange and consuming another provider token.
  if (tokenExternalId) return { externalId: tokenExternalId, requiresActivation: true };

  try {
    const userResponse = await fetch("https://api.wahooligan.com/v1/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
    });
    if (!userResponse.ok) throw new OAuthProviderIdentityError();

    const profile = wahooUserProfileSchema.safeParse(await userResponse.json());
    if (!profile.success || profile.data.id == null) throw new OAuthProviderIdentityError();
    return { externalId: profile.data.id.toString(), requiresActivation: false };
  } catch (error) {
    if (error instanceof OAuthProviderIdentityError) throw error;
    throw new OAuthProviderIdentityError();
  }
}

export async function handleOAuthCallback({
  code,
  db,
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
  const providerAdapter = getProviderOperationAdapter(provider);
  if (!providerAdapter || !providerAdapter.isConfigured()) {
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
  const config = getWahooOAuthConfig();
  const expectedBinding = config ? createOAuthStateBinding({ config, provider, state }) : null;
  if (
    !expectedBinding ||
    storedState.callback_uri !== expectedBinding.callbackUri ||
    storedState.requested_scope !== expectedBinding.requestedScope ||
    storedState.verifier_hash !== expectedBinding.verifierHash
  ) {
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

  let expectedIntegration: OAuthIntegrationExpectation;
  try {
    const existingIntegration = (
      await repositories.integrations.listByProfileId(storedState.profile_id)
    ).find((candidate) => candidate.provider === provider);
    if (existingIntegration?.lifecycle_status === "disconnect_pending") {
      await cleanupState();
      return {
        redirectUrl: buildRedirectUrl(mobileRedirectUri, {
          error: "disconnect_in_progress",
          integration: "failed",
          provider,
        }),
        status: 302,
      };
    }
    if (
      existingIntegration &&
      existingIntegration.lifecycle_status !== "active" &&
      existingIntegration.lifecycle_status !== "disconnected"
    ) {
      throw new IntegrationLifecycleChangedError();
    }
    expectedIntegration = existingIntegration
      ? existingIntegration.lifecycle_status === "active"
        ? {
            generation: existingIntegration.generation,
            kind: "present",
            lifecycleStatus: "active",
          }
        : {
            generation: existingIntegration.generation,
            kind: "present",
            lifecycleStatus: "disconnected",
          }
      : { kind: "absent" };
  } catch (caughtError) {
    logger.warn("OAuth callback lifecycle preflight failed", {
      provider,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
    });
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

  let tokens: ProviderOAuthTokenResponse;
  let externalId: string;
  let requiresActivation: boolean;
  try {
    tokens = await providerAdapter.exchangeOAuthCode({ code, state });
    ({ externalId, requiresActivation } = await providerAdapter.resolveOAuthIdentity(tokens));
  } catch (caughtError) {
    if (caughtError instanceof OAuthProviderIdentityError) {
      logger.warn("OAuth callback provider identity validation failed", { provider });
      await cleanupState();
      return {
        redirectUrl: buildRedirectUrl(mobileRedirectUri, {
          error: "provider_identity_failed",
          integration: "failed",
          provider,
        }),
        status: 302,
      };
    }
    logger.warn("OAuth callback token exchange failed", {
      provider,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
      reason: caughtError instanceof OAuthTokenExchangeError ? caughtError.detail : undefined,
    });
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, {
        error: providerAdapter.connectFailureCode(
          caughtError instanceof OAuthTokenExchangeError ? caughtError.detail : undefined,
        ),
        error_message: providerAdapter.normalizeConnectFailure(
          caughtError instanceof OAuthTokenExchangeError ? caughtError.detail : undefined,
        ).message,
        integration: "failed",
        provider,
      }),
      status: 302,
    };
  }

  let integration: Awaited<
    ReturnType<IntegrationsRepositories["integrations"]["upsertFromOAuthState"]>
  >;
  const grantedScope = tokens.scope || storedState.requested_scope;
  try {
    integration = await runInTransaction(async (transaction) => {
      const storedIntegration = await repositories.integrations.upsertFromOAuthStateInTransaction(
        transaction,
        {
          state,
          now: new Date(),
          expectedIntegration,
          profileId: storedState.profile_id,
          provider,
          externalId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          scope: grantedScope,
        },
      );
      if (storedIntegration) {
        await providerAdapter.enqueueConnectedProfileWork({
          db: db ?? ({} as import("@repo/db").DrizzleDbClient),
          integration: {
            id: storedIntegration.id,
            generation: storedIntegration.generation,
            provider,
            lifecycleStatus: storedIntegration.lifecycle_status as
              | "active"
              | "disconnect_pending"
              | "disconnected",
          },
          profileId: storedState.profile_id,
          scope: grantedScope,
          transaction,
          enqueueJob: (input) =>
            providerSyncRepository.enqueueJobInTransaction(transaction, input as never),
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
        error:
          caughtError instanceof IntegrationDisconnectPendingError
            ? "disconnect_in_progress"
            : caughtError instanceof IntegrationLifecycleChangedError
              ? "integration_state_changed"
              : "store_integration_failed",
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
  if (requiresActivation) {
    try {
      await providerAdapter.activateOAuthCredential(tokens.access_token);
    } catch (caughtError) {
      // Credentials and the history-reconcile job are already durable. Let that job retry the same
      // token rather than turning a temporary provider failure into another OAuth token issuance.
      logger.warn("Wahoo OAuth token activation deferred", {
        provider,
        errorName: caughtError instanceof Error ? caughtError.name : "unknown",
      });
    }
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
