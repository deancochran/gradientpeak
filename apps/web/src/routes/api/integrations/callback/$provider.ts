import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import type { PublicIntegrationProvider } from "@repo/db";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";

class OAuthTokenExchangeError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "OAuthTokenExchangeError";
  }
}

const OAUTH_CONFIGS = {
  strava: {
    tokenUrl: "https://www.strava.com/api/v3/oauth/token",
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
  },
  wahoo: {
    tokenUrl: "https://api.wahooligan.com/oauth/token",
    clientId: process.env.WAHOO_CLIENT_ID!,
    clientSecret: process.env.WAHOO_CLIENT_SECRET!,
  },
  trainingpeaks: {
    tokenUrl: "https://oauth.trainingpeaks.com/oauth/token",
    clientId: process.env.TRAININGPEAKS_CLIENT_ID!,
    clientSecret: process.env.TRAININGPEAKS_CLIENT_SECRET!,
  },
  garmin: {
    tokenUrl: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
    clientId: process.env.GARMIN_CLIENT_ID!,
    clientSecret: process.env.GARMIN_CLIENT_SECRET!,
  },
  zwift: {
    tokenUrl: "https://secure.zwift.com/oauth/token",
    clientId: process.env.ZWIFT_CLIENT_ID!,
    clientSecret: process.env.ZWIFT_CLIENT_SECRET!,
  },
};

function isSupportedProvider(provider: string): provider is PublicIntegrationProvider {
  return provider in OAUTH_CONFIGS;
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

async function exchangeCodeForTokens(provider: PublicIntegrationProvider, code: string) {
  const config = OAUTH_CONFIGS[provider];

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

  return response.json();
}

export const Route = createFileRoute("/api/integrations/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const searchParams = new URL(request.url).searchParams;
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");
        const provider = params.provider;
        const ctx = await createApiContext({
          headers: new Headers(request.headers),
          auth: {
            resolveSession: resolveAuthSession,
          },
          db,
        });
        const caller = appRouter.createCaller(ctx);
        const fallbackRedirect =
          process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK || "gradientpeak://integrations";

        if (!isSupportedProvider(provider)) {
          return Response.redirect(buildRedirectUrl(fallbackRedirect, { error: "invalid_provider" }), 302);
        }

        if (!state) {
          return Response.redirect(buildRedirectUrl(fallbackRedirect, { error: "missing_state" }), 302);
        }

        const storedState = await caller.integrations.validateOAuthState({ state });

        if (!storedState) {
          return Response.redirect(buildRedirectUrl(fallbackRedirect, { error: "invalid_state" }), 302);
        }

        const { userId, mobileRedirectUri } = storedState;

        if (error) {
          await caller.integrations.deleteOAuthState({ state });
          return Response.redirect(buildRedirectUrl(mobileRedirectUri, { error }), 302);
        }

        if (!code) {
          await caller.integrations.deleteOAuthState({ state });
          return Response.redirect(buildRedirectUrl(mobileRedirectUri, { error: "missing_code" }), 302);
        }

        try {
          const tokens = await exchangeCodeForTokens(provider, code);
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

          if (!externalId) {
            externalId = "unknown";
          }

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
            return Response.redirect(
              buildRedirectUrl(mobileRedirectUri, {
                error: "store_integration_failed",
                provider,
              }),
              302,
            );
          }

          return Response.redirect(
            buildRedirectUrl(mobileRedirectUri, { provider, success: "true" }),
            302,
          );
        } catch (caughtError) {
          const detail =
            caughtError instanceof OAuthTokenExchangeError ? caughtError.detail || "unknown" : "unknown";

          console.error("OAuth callback error", {
            provider,
            detail,
            errorName: caughtError instanceof Error ? caughtError.name : "unknown",
          });
          await caller.integrations.deleteOAuthState({ state });
          return Response.redirect(
            buildRedirectUrl(mobileRedirectUri, {
              error: "token_exchange_failed",
              error_detail: detail,
              provider,
            }),
            302,
          );
        }
      },
    },
  },
});
