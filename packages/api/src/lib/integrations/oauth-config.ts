type IntegrationEnv = Record<string, string | undefined>;

type ProviderOAuthConfigDefinition = {
  authUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  pkce: boolean;
  scopes: readonly string[];
  tokenClientAuthentication: "client_secret_basic" | "client_secret_post";
  tokenUrl: string;
};

export type ResolvedWahooOAuthConfig = {
  adapter: "remote" | "local-test";
  authUrl: string;
  clientId: string;
  clientSecret: string;
  pkce: boolean;
  scopes: readonly string[];
  tokenClientAuthentication: "client_secret_basic" | "client_secret_post";
  tokenUrl: string;
};

export function isLocalWahooOAuthTestAdapterEnabled(env: IntegrationEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.WAHOO_OAUTH_TEST_ADAPTER === "1";
}

const wahooOAuthDefinition = {
  authUrl: "https://api.wahooligan.com/oauth/authorize",
  clientIdEnv: "WAHOO_CLIENT_ID",
  clientSecretEnv: "WAHOO_CLIENT_SECRET",
  // The registered GradientPeak Wahoo app is confidential. Wahoo documents PKCE for
  // non-confidential apps and client-secret POST authentication for confidential apps.
  pkce: false,
  scopes: [
    "email",
    "user_write",
    "workouts_read",
    "workouts_write",
    "plans_read",
    "plans_write",
    "user_read",
    "offline_data",
  ],
  tokenClientAuthentication: "client_secret_post",
  tokenUrl: "https://api.wahooligan.com/oauth/token",
} as const satisfies ProviderOAuthConfigDefinition;

export function isSupportedOAuthProvider(provider: string): provider is "wahoo" {
  return provider === "wahoo";
}

function readEnvValue(env: IntegrationEnv, key: string): string | null {
  const value = env[key];
  if (!value) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null" ? trimmed : null;
}

/** Sole server runtime enablement authority for the operational Wahoo integration. */
export function isWahooIntegrationEnabled(env: IntegrationEnv = process.env): boolean {
  return Boolean(readEnvValue(env, "WAHOO_CLIENT_ID") && readEnvValue(env, "WAHOO_CLIENT_SECRET"));
}

export function getWahooOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedWahooOAuthConfig | null {
  const definition = wahooOAuthDefinition;
  if (!isWahooIntegrationEnabled(env)) return null;
  if (isLocalWahooOAuthTestAdapterEnabled(env)) {
    return {
      adapter: "local-test",
      authUrl: "local-test://authorize",
      clientId: "gradientpeak-local-test",
      clientSecret: env.WAHOO_OAUTH_TEST_SECRET || "gradientpeak-local-test-only",
      pkce: true,
      scopes: definition.scopes,
      tokenClientAuthentication: "client_secret_basic",
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
    pkce: definition.pkce,
    scopes: definition.scopes,
    tokenClientAuthentication: definition.tokenClientAuthentication,
    tokenUrl: definition.tokenUrl,
  };
}

export function requireWahooOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedWahooOAuthConfig {
  const config = getWahooOAuthConfig(env);

  if (!config) {
    throw new Error("OAuth credentials are not configured for wahoo");
  }

  return config;
}

export function isWahooOAuthConfigured(env: IntegrationEnv = process.env): boolean {
  return getWahooOAuthConfig(env) !== null;
}
