import {
  type ExecutableIntegrationProviderId,
  type ProviderCapability,
  type ProviderOperationToken,
  type ProviderWorkerRequirement,
  providerCapabilitySchema,
  providerManifestRegistry,
} from "@repo/core";
import { getProviderOAuthConfig } from "../../lib/integrations/oauth-config";

type IntegrationEnv = Record<string, string | undefined>;

type CredentialPresence = "missing" | "partial" | "present";
type CallbackBaseStatus = "missing" | "invalid" | "valid";

export type ProviderReadiness = {
  provider: ExecutableIntegrationProviderId;
  connection: "oauth2";
  credentials: { presence: CredentialPresence };
  callback: {
    baseStatus: CallbackBaseStatus;
    expectedPath: string;
    explicitBaseRequiredForConfiguration: boolean;
  };
  /** This means only that the local resolver can construct its configuration. */
  locallyConfigured: boolean;
  /** The operation list comes from the executable provider manifest registry. */
  manifestRegistered: true;
  directRuntimeOperations: readonly ProviderOperationToken[];
  declaredSupportedCapabilities: readonly ProviderCapability[];
  workerRequirements: readonly ProviderWorkerRequirement[];
};

const credentialEnvironmentKeys = {
  wahoo: ["WAHOO_CLIENT_ID", "WAHOO_CLIENT_SECRET"],
  strava: ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"],
  garmin: ["GARMIN_CLIENT_ID", "GARMIN_CLIENT_SECRET"],
} as const satisfies Record<ExecutableIntegrationProviderId, readonly string[]>;

function hasNonBlankValue(env: IntegrationEnv, key: string): boolean {
  const value = env[key]?.trim();
  return Boolean(value && value !== "undefined" && value !== "null");
}

function getCredentialPresence(
  provider: ExecutableIntegrationProviderId,
  env: IntegrationEnv,
): CredentialPresence {
  const configured = credentialEnvironmentKeys[provider].filter((key) =>
    hasNonBlankValue(env, key),
  );
  if (configured.length === 0) return "missing";
  return configured.length === credentialEnvironmentKeys[provider].length ? "present" : "partial";
}

function getCallbackBaseStatus(env: IntegrationEnv): CallbackBaseStatus {
  const value = env.OAUTH_CALLBACK_BASE_URL;
  if (!value || !hasNonBlankValue(env, "OAUTH_CALLBACK_BASE_URL")) return "missing";

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
      ? "valid"
      : "invalid";
  } catch {
    return "invalid";
  }
}

/**
 * Returns non-secret local configuration facts for each executable OAuth provider.
 * It deliberately does not make a provider request or assert portal-side credential validity.
 */
export function readProviderReadiness(env: IntegrationEnv = process.env): ProviderReadiness[] {
  const callbackBaseStatus = getCallbackBaseStatus(env);

  return providerManifestRegistry.map((manifest) => {
    const provider = manifest.connectorId;
    return {
      provider,
      connection: "oauth2",
      credentials: { presence: getCredentialPresence(provider, env) },
      callback: {
        baseStatus: callbackBaseStatus,
        expectedPath: `/api/integrations/callback/${provider}`,
        // Wahoo currently permits a fallback callback base; Strava and Garmin do not.
        explicitBaseRequiredForConfiguration: provider !== "wahoo",
      },
      locallyConfigured: getProviderOAuthConfig(provider, env) !== null,
      manifestRegistered: true,
      directRuntimeOperations: manifest.runtimeOperations,
      declaredSupportedCapabilities: providerCapabilitySchema.options.filter(
        (capability) => manifest.capabilities[capability].status === "supported",
      ),
      workerRequirements: manifest.workerRequirements,
    };
  });
}
