import {
  type ExecutableIntegrationProviderId,
  getProviderRequiredAuthorizationScopes,
  type PersistentIntegrationSourceId,
  providerManifestRegistry,
} from "@repo/core";

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

export type ResolvedProviderOAuthConfig = {
  adapter: "remote" | "local-test";
  authUrl: string;
  clientId: string;
  clientSecret: string;
  pkce: boolean;
  scopes: readonly string[];
  tokenClientAuthentication: "client_secret_basic" | "client_secret_post";
  tokenUrl: string;
};

/** Compatibility name for Wahoo-specific callers while shared OAuth code uses the neutral type. */
export type ResolvedWahooOAuthConfig = ResolvedProviderOAuthConfig;

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

const stravaOAuthDefinition = {
  authUrl: "https://www.strava.com/oauth/authorize",
  clientIdEnv: "STRAVA_CLIENT_ID",
  clientSecretEnv: "STRAVA_CLIENT_SECRET",
  // Strava's confidential authorization-code flow does not currently document PKCE.
  pkce: false,
  scopes: ["activity:read_all", "activity:write"],
  tokenClientAuthentication: "client_secret_post",
  tokenUrl: "https://www.strava.com/oauth/token",
} as const satisfies ProviderOAuthConfigDefinition;

const garminOAuthDefinition = {
  authUrl: "https://connect.garmin.com/oauth2Confirm",
  clientIdEnv: "GARMIN_CLIENT_ID",
  clientSecretEnv: "GARMIN_CLIENT_SECRET",
  pkce: true,
  // Garmin assigns API scopes while registering the app. Per-user grants are fetched
  // after consent from the permissions endpoint, not requested here.
  scopes: [],
  tokenClientAuthentication: "client_secret_post",
  tokenUrl: "https://diauth.garmin.com/di-oauth2-service/oauth/token",
} as const satisfies ProviderOAuthConfigDefinition;

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

function hasExplicitOAuthCallbackBase(env: IntegrationEnv): boolean {
  const value = readEnvValue(env, "OAUTH_CALLBACK_BASE_URL");
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}

/** Strava must never appear executable without both credentials and an explicit callback base. */
export function isStravaIntegrationEnabled(env: IntegrationEnv = process.env): boolean {
  return Boolean(
    readEnvValue(env, "STRAVA_CLIENT_ID") &&
      readEnvValue(env, "STRAVA_CLIENT_SECRET") &&
      hasExplicitOAuthCallbackBase(env),
  );
}

export function getStravaOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig | null {
  if (!isStravaIntegrationEnabled(env)) return null;
  const clientId = readEnvValue(env, stravaOAuthDefinition.clientIdEnv);
  const clientSecret = readEnvValue(env, stravaOAuthDefinition.clientSecretEnv);
  if (!clientId || !clientSecret) return null;
  return {
    adapter: "remote",
    authUrl: stravaOAuthDefinition.authUrl,
    clientId,
    clientSecret,
    pkce: stravaOAuthDefinition.pkce,
    scopes: stravaOAuthDefinition.scopes,
    tokenClientAuthentication: stravaOAuthDefinition.tokenClientAuthentication,
    tokenUrl: stravaOAuthDefinition.tokenUrl,
  };
}

export function isGarminIntegrationEnabled(env: IntegrationEnv = process.env): boolean {
  return Boolean(
    readEnvValue(env, "GARMIN_CLIENT_ID") &&
      readEnvValue(env, "GARMIN_CLIENT_SECRET") &&
      hasExplicitOAuthCallbackBase(env),
  );
}

export function getGarminOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig | null {
  if (!isGarminIntegrationEnabled(env)) return null;
  const clientId = readEnvValue(env, garminOAuthDefinition.clientIdEnv);
  const clientSecret = readEnvValue(env, garminOAuthDefinition.clientSecretEnv);
  if (!clientId || !clientSecret) return null;
  return { adapter: "remote", clientId, clientSecret, ...garminOAuthDefinition };
}

/** Token maintenance for existing grants is independent of new-connection admission. */
export function requireGarminTokenConfig(env: IntegrationEnv = process.env) {
  const clientId = readEnvValue(env, garminOAuthDefinition.clientIdEnv);
  const clientSecret = readEnvValue(env, garminOAuthDefinition.clientSecretEnv);
  if (!clientId || !clientSecret)
    throw new Error("Garmin token maintenance credentials are not configured");
  return { clientId, clientSecret, tokenUrl: garminOAuthDefinition.tokenUrl };
}

export function createProviderOAuthConfigRegistry<TProvider extends string>(
  resolvers: ReadonlyMap<TProvider, (env: IntegrationEnv) => ResolvedProviderOAuthConfig | null>,
) {
  return {
    get(provider: TProvider, env: IntegrationEnv = process.env) {
      return resolvers.get(provider)?.(env) ?? null;
    },
    require(provider: TProvider, env: IntegrationEnv = process.env) {
      const config = resolvers.get(provider)?.(env) ?? null;
      if (!config) throw new Error(`OAuth credentials are not configured for ${provider}`);
      return config;
    },
  };
}

const oauthConfigResolvers = {
  wahoo: getWahooOAuthConfig,
  strava: getStravaOAuthConfig,
  garmin: getGarminOAuthConfig,
} satisfies Record<
  ExecutableIntegrationProviderId,
  (env: IntegrationEnv) => ResolvedProviderOAuthConfig | null
>;

const providerOAuthDefinitions = {
  wahoo: wahooOAuthDefinition,
  strava: stravaOAuthDefinition,
  garmin: garminOAuthDefinition,
} as const satisfies Record<ExecutableIntegrationProviderId, ProviderOAuthConfigDefinition>;

export function certifyProviderOAuthScopeCoverage(
  definitions: Readonly<
    Record<ExecutableIntegrationProviderId, Pick<ProviderOAuthConfigDefinition, "scopes">>
  > = providerOAuthDefinitions,
): void {
  for (const manifest of providerManifestRegistry) {
    if (manifest.connection.kind !== "oauth2") continue;
    // Garmin assigns API permissions to the application and returns the user's
    // grants from its permissions endpoint; its PKCE authorization request must
    // not synthesize an OAuth `scope` parameter for WORKOUT_IMPORT.
    if (manifest.connectorId === "garmin") continue;
    const requested = new Set(definitions[manifest.connectorId].scopes);
    for (const scope of getProviderRequiredAuthorizationScopes(manifest.connectorId)) {
      if (!requested.has(scope)) {
        throw new Error(`Provider OAuth scope is missing: ${manifest.connectorId}/${scope}`);
      }
    }
  }
}

certifyProviderOAuthScopeCoverage();

/** Core's manifest owns the executable connector/source list; this module owns only credential resolution. */
const providerOAuthConfigRegistry =
  createProviderOAuthConfigRegistry<PersistentIntegrationSourceId>(
    new Map<
      PersistentIntegrationSourceId,
      (env: IntegrationEnv) => ResolvedProviderOAuthConfig | null
    >(
      providerManifestRegistry.map((manifest) => [
        manifest.connectorId,
        oauthConfigResolvers[manifest.connectorId],
      ]),
    ),
  );

/** Provider-neutral configuration seam. Provider definitions remain owned by their adapters. */
export function getProviderOAuthConfig(
  provider: PersistentIntegrationSourceId,
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig | null {
  return providerOAuthConfigRegistry.get(provider, env);
}

export function requireProviderOAuthConfig(
  provider: PersistentIntegrationSourceId,
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig {
  return providerOAuthConfigRegistry.require(provider, env);
}

export function requireWahooOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedWahooOAuthConfig {
  return requireProviderOAuthConfig("wahoo", env);
}

export function isWahooOAuthConfigured(env: IntegrationEnv = process.env): boolean {
  return getWahooOAuthConfig(env) !== null;
}

export function requireStravaOAuthConfig(
  env: IntegrationEnv = process.env,
): ResolvedProviderOAuthConfig {
  return requireProviderOAuthConfig("strava", env);
}

export function isStravaOAuthConfigured(env: IntegrationEnv = process.env): boolean {
  return getStravaOAuthConfig(env) !== null;
}

/** Upload identity signing is independently configured from read/import execution. */
export function getStravaUploadExternalIdSecret(env: IntegrationEnv = process.env): string | null {
  const secret = readEnvValue(env, "STRAVA_UPLOAD_EXTERNAL_ID_SECRET");
  return secret && secret.length >= 32 ? secret : null;
}

export function isStravaCompletedActivityUploadConfigured(
  env: IntegrationEnv = process.env,
): boolean {
  return isStravaIntegrationEnabled(env) && getStravaUploadExternalIdSecret(env) !== null;
}

export function requireStravaUploadExternalIdSecret(env: IntegrationEnv = process.env): string {
  const secret = getStravaUploadExternalIdSecret(env);
  if (!secret) throw new Error("Strava upload external ID secret is not configured");
  return secret;
}
