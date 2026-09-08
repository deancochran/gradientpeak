import {
  type ExecutableIntegrationProviderId,
  providerCapabilityRegistry,
  providerHasCapability,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import {
  type CompletedActivityProviderEligibility,
  CompletedActivityProviderNotFoundError,
  type CompletedActivityProviderSendResult,
  type ProviderOperationAdapter,
} from "./provider-operation-registry";
import { getProviderOperationAdapter } from "./provider-operation-runtime";

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
  const eligibleProviders = providerCapabilityRegistry.filter((definition) =>
    providerHasCapability(definition.id, "completed_activity_export"),
  );
  return Promise.all(
    eligibleProviders.map(async (definition) => {
      const adapter = getProviderOperationAdapter(definition.id);
      if (!adapter?.isConfigured() || !adapter.readCompletedActivityUploadEligibility) {
        return unavailable(definition.id);
      }
      return adapter.readCompletedActivityUploadEligibility(input);
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
    resolveAdapter?: (
      provider: ExecutableIntegrationProviderId,
    ) => ProviderOperationAdapter<ExecutableIntegrationProviderId> | null;
  } = {},
): Promise<CompletedActivityProviderSendResult> {
  if (!providerHasCapability(input.provider, "completed_activity_export")) {
    return { jobId: null, provider: input.provider, status: "unavailable" };
  }
  const adapter = (dependencies.resolveAdapter ?? getProviderOperationAdapter)(input.provider);
  if (!adapter?.isConfigured() || !adapter.sendCompletedActivity) {
    return { jobId: null, provider: input.provider, status: "unavailable" };
  }
  return adapter.sendCompletedActivity(input);
}
