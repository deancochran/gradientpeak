import {
  type PersistentIntegrationSourceId,
  persistentIntegrationSourceIdSchema,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../db";
import { logger } from "../../lib/logger";
import {
  IntegrationDisconnectPendingError,
  IntegrationLifecycleChangedError,
  type IntegrationsRepositories,
  type OAuthIntegrationExpectation,
} from "../../repositories/integrations-repository";
import type { ProviderOperationAdapter } from "./provider-operation-registry";
import { getProviderOperationAdapter } from "./provider-operation-runtime";

type OAuthCallbackAdapter = Pick<
  ProviderOperationAdapter<string>,
  | "activateOAuthCredential"
  | "classifyOAuthFailure"
  | "enqueueConnectedProfileWork"
  | "exchangeOAuthCode"
  | "isOAuthConfigured"
  | "provider"
  | "resolveOAuthIdentity"
  | "validateOAuthStateBinding"
>;

export type HandleOAuthCallbackInput = {
  db?: DrizzleDbClient;
  code: string | null;
  error: string | null;
  fallbackRedirect: string;
  provider: string;
  repositories: IntegrationsRepositories;
  enqueueProviderJobInTransaction?: (
    transaction: DrizzleTransactionClient,
    input: unknown,
  ) => Promise<{ id: string; status: string }>;
  resolveProviderAdapter?: (provider: PersistentIntegrationSourceId) => OAuthCallbackAdapter | null;
  runInTransaction: <T>(
    operation: (transaction: DrizzleTransactionClient) => Promise<T>,
  ) => Promise<T>;
  state: string | null;
};

export type HandleOAuthCallbackResult = { redirectUrl: string; status: 302 };

function buildRedirectUrl(baseUrl: string, params: Record<string, string | null | undefined>) {
  const redirectUrl = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl.toString();
}

export async function handleOAuthCallback({
  code,
  db,
  error,
  fallbackRedirect,
  provider: rawProvider,
  repositories,
  enqueueProviderJobInTransaction,
  resolveProviderAdapter = getProviderOperationAdapter,
  runInTransaction,
  state,
}: HandleOAuthCallbackInput): Promise<HandleOAuthCallbackResult> {
  const parsedProvider = persistentIntegrationSourceIdSchema.safeParse(rawProvider);
  if (!parsedProvider.success) {
    return {
      redirectUrl: buildRedirectUrl(fallbackRedirect, { error: "invalid_provider" }),
      status: 302,
    };
  }
  const provider = parsedProvider.data;
  const providerAdapter = resolveProviderAdapter(provider);
  if (
    !providerAdapter ||
    providerAdapter.provider !== provider ||
    !providerAdapter.isOAuthConfigured()
  ) {
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
  let bindingValid = false;
  if (storedState.callback_uri && storedState.requested_scope && storedState.verifier_hash) {
    try {
      bindingValid = providerAdapter.validateOAuthStateBinding({
        binding: {
          callbackUri: storedState.callback_uri,
          requestedScope: storedState.requested_scope,
          verifierHash: storedState.verifier_hash,
        },
        state,
      });
    } catch {
      bindingValid = false;
    }
  }
  if (!bindingValid) {
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
      ? {
          generation: existingIntegration.generation,
          kind: "present",
          lifecycleStatus:
            existingIntegration.lifecycle_status === "active" ? "active" : "disconnected",
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

  let tokens: Awaited<ReturnType<OAuthCallbackAdapter["exchangeOAuthCode"]>>;
  let externalId: string;
  let requiresActivation: boolean;
  try {
    tokens = await providerAdapter.exchangeOAuthCode({ code, state });
    ({ externalId, requiresActivation } = await providerAdapter.resolveOAuthIdentity(tokens));
  } catch (caughtError) {
    const failure = providerAdapter.classifyOAuthFailure(caughtError);
    logger.warn(
      failure.kind === "identity"
        ? "OAuth callback provider identity validation failed"
        : "OAuth callback token exchange failed",
      {
        provider,
        errorName: caughtError instanceof Error ? caughtError.name : "unknown",
        reason: failure.reason,
      },
    );
    await cleanupState();
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, {
        error: failure.code,
        error_message: failure.message,
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
        if (storedIntegration.lifecycle_status !== "active") {
          throw new IntegrationLifecycleChangedError();
        }
        await providerAdapter.enqueueConnectedProfileWork({
          db: db ?? ({} as DrizzleDbClient),
          integration: {
            id: storedIntegration.id,
            generation: storedIntegration.generation,
            provider,
            lifecycleStatus: "active",
          },
          profileId: storedState.profile_id,
          scope: grantedScope,
          transaction,
          ...(enqueueProviderJobInTransaction
            ? {
                enqueueJob: (input: unknown) => enqueueProviderJobInTransaction(transaction, input),
              }
            : {}),
        });
      }
      return storedIntegration;
    });
  } catch (caughtError) {
    logger.warn("OAuth callback credential storage failed", {
      provider,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
    });
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
      logger.warn("Provider OAuth credential activation deferred", {
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
