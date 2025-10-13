import type { Database, PublicIntegrationProvider } from "@repo/core";
import { appRouter, createTRPCContext } from "@repo/trpc/server";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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

async function exchangeCodeForTokens(
  provider: PublicIntegrationProvider,
  code: string,
) {
  const config = OAUTH_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Get environment-specific callback URL
  const baseUrl =
    process.env.OAUTH_CALLBACK_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const redirectUri = `${baseUrl}/api/integrations/callback/${provider}`;

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Token exchange failed:", {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      provider,
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const resolvedParams = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Debug logging to see what Wahoo actually sends
  console.log("OAuth callback received:", {
    provider: resolvedParams.provider,
    url: request.url,
    searchParams: Object.fromEntries(searchParams.entries()),
    code: code ? "present" : "missing",
    state: state ? "present" : "missing",
    error: error || "none",
  });

  // Create Supabase client with service role for OAuth operations
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );

  // Create tRPC context and caller
  const ctx = await createTRPCContext({
    headers: request.headers,
    supabase,
  });
  const caller = appRouter.createCaller(ctx);

  // Default fallback redirect for errors
  const fallbackRedirect =
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK ||
    "gradientpeak://integrations";

  // Validate OAuth state using tRPC
  if (!state) {
    return NextResponse.redirect(`${fallbackRedirect}?error=missing_state`);
  }

  const storedState = await caller.integrations.validateOAuthState({ state });

  if (!storedState) {
    // No valid state found - possible CSRF attack or expired flow
    return NextResponse.redirect(`${fallbackRedirect}?error=invalid_state`);
  }

  const { userId, mobileRedirectUri } = storedState;

  // Handle OAuth errors
  if (error) {
    // Clean up the state since the flow failed
    await caller.integrations.deleteOAuthState({ state });
    return NextResponse.redirect(`${mobileRedirectUri}?error=${error}`);
  }

  if (!code) {
    await caller.integrations.deleteOAuthState({ state });
    return NextResponse.redirect(`${mobileRedirectUri}?error=missing_code`);
  }

  const provider = resolvedParams.provider as PublicIntegrationProvider;

  try {
    // Exchange code for tokens with the provider
    const tokens = await exchangeCodeForTokens(provider, code);

    // Store integration using tRPC
    await caller.integrations.storeIntegration({
      userId,
      provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scope: tokens.scope || null,
      state, // Pass state to clean it up after storing
    });

    // Redirect back to mobile app with success
    return NextResponse.redirect(
      `${mobileRedirectUri}?success=true&provider=${provider}`,
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    // Clean up state on any error
    await caller.integrations.deleteOAuthState({ state });
    return NextResponse.redirect(`${mobileRedirectUri}?error=server_error`);
  }
}
