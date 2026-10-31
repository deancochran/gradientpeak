import {
  type ExecutableIntegrationProviderId,
  executableIntegrationProviderIdSchema,
  type PersistentIntegrationSourceId,
  providerManifestRegistry,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import { garminProviderRuntime } from "./garmin-provider-runtime";
import {
  certifyComposedProviderRuntimeRegistry,
  createComposedProviderRuntimeRegistry,
  type ProviderConnectedProfileRuntime,
  type ProviderOAuthConnectionRuntime,
  ProviderRuntimeUnavailableError,
} from "./provider-runtime";
import { stravaProviderRuntime } from "./strava-provider-runtime";
import { wahooProviderRuntime } from "./wahoo-provider-runtime";

export const executableProviderRuntimes = [
  wahooProviderRuntime,
  stravaProviderRuntime,
  garminProviderRuntime,
] as const;

certifyComposedProviderRuntimeRegistry(providerManifestRegistry, executableProviderRuntimes);

export const providerRuntimeRegistry = createComposedProviderRuntimeRegistry(
  executableProviderRuntimes,
);

function getRegisteredProviderRuntime(provider: PersistentIntegrationSourceId) {
  const executableProvider = executableIntegrationProviderIdSchema.safeParse(provider);
  return executableProvider.success ? providerRuntimeRegistry.get(executableProvider.data) : null;
}

export type ProviderOAuthCallbackRuntime = {
  provider: ExecutableIntegrationProviderId;
  connection: ProviderOAuthConnectionRuntime<ExecutableIntegrationProviderId>;
  connectedProfile: ProviderConnectedProfileRuntime;
};

export function getProviderOAuthCallbackRuntime(
  provider: PersistentIntegrationSourceId,
): ProviderOAuthCallbackRuntime | null {
  const runtime = getRegisteredProviderRuntime(provider);
  if (
    !runtime ||
    runtime.connection.kind !== "oauth2" ||
    !runtime.connection.isOAuthConfigured() ||
    !runtime.execution.server.connectedProfile
  ) {
    return null;
  }
  return {
    provider: runtime.provider,
    connection: runtime.connection,
    connectedProfile: runtime.execution.server.connectedProfile,
  };
}

export function requireProviderOAuthAuthorizationRuntime(
  provider: ExecutableIntegrationProviderId,
): ProviderOAuthConnectionRuntime<ExecutableIntegrationProviderId> {
  const runtime = providerRuntimeRegistry.get(provider);
  if (
    !runtime ||
    runtime.connection.kind !== "oauth2" ||
    !runtime.connection.isOAuthConfigured() ||
    !runtime.execution.server.availability.isConfigured()
  ) {
    throw new ProviderRuntimeUnavailableError(provider);
  }
  return runtime.connection;
}

export function getProviderOverviewRuntime(provider: PersistentIntegrationSourceId) {
  const runtime = getRegisteredProviderRuntime(provider);
  if (!runtime) return null;
  return {
    availability: runtime.execution.server.availability,
    actionAuthorization: runtime.execution.server.actionAuthorization,
    overview: runtime.execution.server.overview,
  };
}

export function getProviderSetupRuntime(provider: PersistentIntegrationSourceId) {
  return getRegisteredProviderRuntime(provider)?.execution.server.setup ?? null;
}

export function requireProviderSetupRuntime(provider: ExecutableIntegrationProviderId) {
  const runtime = providerRuntimeRegistry.get(provider);
  const setup = runtime?.execution.server.setup;
  if (!runtime?.execution.server.availability.isConfigured() || !setup) {
    throw new ProviderRuntimeUnavailableError(provider);
  }
  return setup;
}

export function requireProviderSynchronizationRuntime(provider: ExecutableIntegrationProviderId) {
  const runtime = providerRuntimeRegistry.get(provider);
  const synchronization = runtime?.execution.server.synchronization;
  if (!runtime?.execution.server.availability.isConfigured() || !synchronization) {
    throw new ProviderRuntimeUnavailableError(provider);
  }
  return synchronization;
}

export function requireProviderDisconnectionRuntime(provider: ExecutableIntegrationProviderId) {
  const runtime = providerRuntimeRegistry.get(provider);
  const disconnection = runtime?.execution.server.disconnection;
  if (
    !disconnection ||
    (!runtime?.execution.server.availability.isConfigured() && !disconnection.availableWhenDisabled)
  ) {
    throw new ProviderRuntimeUnavailableError(provider);
  }
  return disconnection;
}

export function getProviderOnboardingRuntime(provider: ExecutableIntegrationProviderId) {
  return providerRuntimeRegistry.get(provider)?.execution.server.onboarding ?? null;
}

export function getExecutableProviderOnboardingRuntime(provider: ExecutableIntegrationProviderId) {
  const runtime = providerRuntimeRegistry.get(provider);
  if (!runtime?.execution.server.availability.isConfigured()) return null;
  return runtime.execution.server.onboarding ?? null;
}

export function requireProviderOnboardingRuntime(provider: ExecutableIntegrationProviderId) {
  const runtime = getExecutableProviderOnboardingRuntime(provider);
  if (!runtime) throw new ProviderRuntimeUnavailableError(provider);
  return runtime;
}

export function getProviderCompletedActivityExportRuntime(
  provider: ExecutableIntegrationProviderId,
) {
  const runtime = providerRuntimeRegistry.get(provider);
  const completedActivityExport = runtime?.execution.server.completedActivityExport;
  if (!runtime || !completedActivityExport) return null;
  return { availability: runtime.execution.server.availability, completedActivityExport };
}

export function getProviderReviewedSourceMaterializationRuntime(
  provider: PersistentIntegrationSourceId,
) {
  return (
    getRegisteredProviderRuntime(provider)?.execution.server.reviewedSourceMaterialization ?? null
  );
}

export function getProviderCredentialRevocationRuntime(provider: ExecutableIntegrationProviderId) {
  return providerRuntimeRegistry.get(provider)?.execution.server.credentialRevocation ?? null;
}

/** Manifest order is deterministic precedence when several runtimes contribute profile evidence. */
export async function readConfiguredProviderSetupEvidence(input: {
  db: DrizzleDbClient;
  profileId: string;
}) {
  const configuredSetupRuntimes = executableProviderRuntimes.flatMap((runtime) => {
    const setup = runtime.execution.server.setup;
    return runtime.execution.server.availability.isConfigured() && setup
      ? [{ provider: runtime.provider, setup }]
      : [];
  });
  return Promise.all(
    configuredSetupRuntimes.map(async ({ provider, setup }) => ({
      provider,
      evidence: await setup.readSetupEvidence(input),
    })),
  );
}
