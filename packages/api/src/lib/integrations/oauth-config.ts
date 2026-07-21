import type { IntegrationProviderId } from "@repo/core";
import type { PublicIntegrationProvider } from "@repo/db";

type IntegrationEnv = Record<string, string | undefined>;

type ProviderOAuthConfigDefinition = {
  authUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: readonly string[];
  tokenUrl: string;
};

export type ResolvedProviderOAuthConfig = {
  adapter: "remote" | "local-test";
  authUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
  tokenUrl: string;
};

export function isLocalProviderOAuthTestAdapterEnabled(env: IntegrationEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.PROVIDER_OAUTH_TEST_ADAPTER === "1";
}

const providerOAuthRegistry = {
  strava: {
    authUrl: "https://www.strava.com/oauth/authorize",
    clientIdEnv: "STRAVA_CLIENT_ID",
    clientSecretEnv: "STRAVA_CLIENT_SECRET",
    scopes: ["activity:read_all"],
    tokenUrl: "https://www.strava.com/api/v3/oauth/token",
  },
  wahoo: {
    authUrl: "https://api.wahooligan.com/oauth/authorize",
    clientIdEnv: "WAHOO_CLIENT_ID",
    clientSecretEnv: "WAHOO_CLIENT_SECRET",
    scopes: [
      "email",
      "user_write",
      "power_zones_read",
      "power_zones_write",
      "workouts_read",
      "workouts_write",
      "plans_read",
      "plans_write",
      "routes_read",
      "routes_write",
      "user_read",
      "offline_data",
    ],
    tokenUrl: "https://api.wahooligan.com/oauth/token",
  },
  trainingpeaks: {
    authUrl: "https://oauth.trainingpeaks.com/oauth/authorize",
    clientIdEnv: "TRAININGPEAKS_CLIENT_ID",
    clientSecretEnv: "TRAININGPEAKS_CLIENT_SECRET",
    scopes: ["activities:read", "metrics:read"],
    tokenUrl: "https://oauth.trainingpeaks.com/oauth/token",
  },
  garmin: {
    authUrl: "https://connect.garmin.com/oauthConfirm",
    clientIdEnv: "GARMIN_CLIENT_ID",
    clientSecretEnv: "GARMIN_CLIENT_SECRET",
    scopes: ["activity_read"],
    tokenUrl: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
  },
  zwift: {
    authUrl: "https://secure.zwift.com/oauth/authorize",
    clientIdEnv: "ZWIFT_CLIENT_ID",
    clientSecretEnv: "ZWIFT_CLIENT_SECRET",
    scopes: ["activity:read"],
    tokenUrl: "https://secure.zwift.com/oauth/token",
  },
} as const satisfies Record<IntegrationProviderId, ProviderOAuthConfigDefinition>;

export function isSupportedOAuthProvider(provider: string): provider is PublicIntegrationProvider {
  return provider in providerOAuthRegistry;
}

function readEnvValue(env: IntegrationEnv, key: string): string | null {
  const value = env[key];
  if (!value) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null" ? trimmed : null;
}

export function getProviderOAuthConfig(
  provider: PublicIntegrationProvider,
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig | null {
  const definition = providerOAuthRegistry[provider];
  if (provider === "wahoo" && isLocalProviderOAuthTestAdapterEnabled(env)) {
    return {
      adapter: "local-test",
      authUrl: "local-test://authorize",
      clientId: "gradientpeak-local-test",
      clientSecret: env.PROVIDER_OAUTH_TEST_SECRET || "gradientpeak-local-test-only",
      scopes: definition.scopes,
      tokenUrl: "local-test://token",
    };
  }
  const clientId = readEnvValue(env, definition.clientIdEnv);
  const clientSecret = readEnvValue(env, definition.clientSecretEnv);

  if (!clientId || !clientSecret) return null;

  return {
    adapter: "remote",
    authUrl: definition.authUrl,
    clientId,
    clientSecret,
    scopes: definition.scopes,
    tokenUrl: definition.tokenUrl,
  };
}

export function requireProviderOAuthConfig(
  provider: PublicIntegrationProvider,
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig {
  const config = getProviderOAuthConfig(provider, env);

  if (!config) {
    throw new Error(`OAuth credentials are not configured for ${provider}`);
  }

  return config;
}

export function isProviderOAuthConfigured(
  provider: PublicIntegrationProvider,
  env: IntegrationEnv = process.env,
): boolean {
  return getProviderOAuthConfig(provider, env) !== null;
}
