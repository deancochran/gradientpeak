import {
  type ExecutableIntegrationProviderId,
  providerHasCapability,
  providerManifestRegistry,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import {
  type CompletedActivityProviderEligibility,
  CompletedActivityProviderNotFoundError,
  type CompletedActivityProviderSendResult,
  type ProviderCompletedActivityExportRuntime,
} from "./provider-runtime";
import { getProviderCompletedActivityExportRuntime } from "./provider-runtime-registry";

export { CompletedActivityProviderNotFoundError };

function unavailable(provider: string): CompletedActivityProviderEligibility {
  return {
    jobId: null,
    provider,
    reason: "Completed activity delivery is unavailable for this provider.",
    status: "unavailable",
  };
}

export async function getCompletedActivityProviderEligibility(input: {
  activityId: string;
  db: DrizzleDbClient;
  profileId: string;
}): Promise<CompletedActivityProviderEligibility[]> {
  const eligibleProviders = providerManifestRegistry.filter((definition) =>
    providerHasCapability(definition.connectorId, "completed_activity_export"),
  );
  return Promise.all(
    eligibleProviders.map(async (definition) => {
      const runtime = getProviderCompletedActivityExportRuntime(definition.connectorId);
      if (!runtime?.availability.isConfigured()) {
        return unavailable(definition.connectorId);
      }
      return runtime.completedActivityExport.readCompletedActivityUploadEligibility(input);
    }),
  );
}

export async function sendCompletedActivityToProvider(
  input: {
    activityId: string;
    db: DrizzleDbClient;
    profileId: string;
    provider: ExecutableIntegrationProviderId;
  },
  dependencies: {
    resolveRuntime?: (provider: ExecutableIntegrationProviderId) => {
      availability: { isConfigured: () => boolean };
      completedActivityExport: ProviderCompletedActivityExportRuntime;
    } | null;
  } = {},
): Promise<CompletedActivityProviderSendResult> {
  if (!providerHasCapability(input.provider, "completed_activity_export")) {
    return { jobId: null, provider: input.provider, status: "unavailable" };
  }
  const runtime = (dependencies.resolveRuntime ?? getProviderCompletedActivityExportRuntime)(
    input.provider,
  );
  if (!runtime?.availability.isConfigured()) {
    return { jobId: null, provider: input.provider, status: "unavailable" };
  }
  return runtime.completedActivityExport.sendCompletedActivity(input);
}
