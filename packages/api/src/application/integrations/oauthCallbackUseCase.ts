import type { PublicIntegrationProvider } from "@repo/db";

import {
  getProviderOAuthConfig,
  isSupportedOAuthProvider,
} from "../../lib/integrations/oauth-config";

type ValidatedOAuthState = {
  userId: string;
  provider: PublicIntegrationProvider;
  mobileRedirectUri: string;
  createdAt: string;
};

type StoreIntegrationInput = {
  userId: string;
  provider: PublicIntegrationProvider;
  externalId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  state: string;
};

export type OAuthCallbackCaller = {
  integrations: {
    validateOAuthState(input: { state: string }): Promise<ValidatedOAuthState | null>;
    deleteOAuthState(input: { state: string }): Promise<{ success: boolean }>;
    storeIntegration(input: StoreIntegrationInput): Promise<{ success: boolean }>;
  };
};

export type HandleOAuthCallbackInput = {
  caller: OAuthCallbackCaller;
  code: string | null;
  error: string | null;
  fallbackRedirect: string;
  provider: string;
  state: string | null;
};

export type HandleOAuthCallbackResult = {
  redirectUrl: string;
  status: 302;
};

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
  scope?: string | null;
  athlete?: { id?: string | number | null } | null;
  user?: { id?: string | number | null } | null;
  userId?: string | number | null;
  id?: string | number | null;
};

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
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return redirectUrl.toString();
}

async function exchangeCodeForTokens(
  provider: PublicIntegrationProvider,
  code: string,
): Promise<OAuthTokenResponse> {
  const config = getProviderOAuthConfig(provider);

  if (!config) {
    throw new OAuthTokenExchangeError("OAuth credentials are not configured", "not_configured");
  }

  const baseUrl =
    process.env.OAUTH_CALLBACK_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/integrations/callback/${provider}`;

  const requestToken = async (useBasicAuth: boolean) => {
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      ...(useBasicAuth
        ? {}
        : {
            client_id: config.clientId,
            client_secret: config.clientSecret,
          }),
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    if (useBasicAuth) {
      headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
    }

    return fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
    });
  };

  let response = await requestToken(true);
  if (!response.ok) {
    response = await requestToken(false);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail =
      (typeof errorData?.error_description === "string" && errorData.error_description) ||
      (typeof errorData?.error === "string" && errorData.error) ||
      (typeof errorData?.message === "string" && errorData.message) ||
      `http_${response.status}`;

    console.error("Token exchange failed", { detail, provider, status: response.status });
    throw new OAuthTokenExchangeError(`Token exchange failed: ${response.status}`, detail);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

async function resolveExternalId(
  provider: PublicIntegrationProvider,
  tokens: OAuthTokenResponse,
): Promise<string> {
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

      if (userResponse.ok) {
        const userData = (await userResponse.json()) as { id: number };
        externalId = userData.id.toString();
      }
    } catch (userError) {
      console.error("Failed to fetch Wahoo user profile", {
        provider,
        errorName: userError instanceof Error ? userError.name : "unknown",
      });
    }
  }

  return externalId || "unknown";
}

export async function handleOAuthCallback({
  caller,
  code,
  error,
  fallbackRedirect,
  provider,
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

  const storedState = await caller.integrations.validateOAuthState({ state });

  if (!storedState) {
    return {
      redirectUrl: buildRedirectUrl(fallbackRedirect, { error: "invalid_state" }),
      status: 302,
    };
  }

  const { userId, mobileRedirectUri } = storedState;

  if (error) {
    await caller.integrations.deleteOAuthState({ state });
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error }),
      status: 302,
    };
  }

  if (!code) {
    await caller.integrations.deleteOAuthState({ state });
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { error: "missing_code" }),
      status: 302,
    };
  }

  try {
    const tokens = await exchangeCodeForTokens(provider, code);
    const externalId = await resolveExternalId(provider, tokens);

    try {
      await caller.integrations.storeIntegration({
        userId,
        provider,
        externalId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        scope: tokens.scope || null,
        state,
      });
    } catch (storeError) {
      console.error("Failed to store integration", {
        provider,
        userId,
        externalId,
        errorName: storeError instanceof Error ? storeError.name : "unknown",
      });
      await caller.integrations.deleteOAuthState({ state });
      return {
        redirectUrl: buildRedirectUrl(mobileRedirectUri, {
          error: "store_integration_failed",
          provider,
        }),
        status: 302,
      };
    }

    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, { provider, success: "true" }),
      status: 302,
    };
  } catch (caughtError) {
    const detail =
      caughtError instanceof OAuthTokenExchangeError ? caughtError.detail || "unknown" : "unknown";

    console.error("OAuth callback error", {
      provider,
      detail,
      errorName: caughtError instanceof Error ? caughtError.name : "unknown",
    });
    await caller.integrations.deleteOAuthState({ state });
    return {
      redirectUrl: buildRedirectUrl(mobileRedirectUri, {
        error: "token_exchange_failed",
        error_detail: detail,
        provider,
      }),
      status: 302,
    };
  }
}
