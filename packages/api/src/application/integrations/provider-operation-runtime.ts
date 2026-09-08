import {
  type ExecutableIntegrationProviderId,
  executableIntegrationProviderIdSchema,
  type PersistentIntegrationSourceId,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import {
  createProviderOperationRegistry,
  type ProviderOperationAdapter,
} from "./provider-operation-registry";
import { stravaProviderOperationAdapter } from "./strava-provider-operation-adapter";
import { wahooProviderOperationAdapter } from "./wahoo-provider-operation-adapter";

type ExecutableProviderAdapter = ProviderOperationAdapter<ExecutableIntegrationProviderId>;

/** Runtime-check and rebuild provider-bearing inputs when erasing an adapter's concrete key. */
function toExecutableAdapter<TProvider extends ExecutableIntegrationProviderId>(
  adapter: ProviderOperationAdapter<TProvider>,
): ExecutableProviderAdapter {
  return {
    ...adapter,
    readOverviewEvidence: (input) => {
      if (!input.integration) return adapter.readOverviewEvidence(input);
      if (input.integration.provider !== adapter.provider) {
        throw new Error("Provider adapter context mismatch");
      }
      return adapter.readOverviewEvidence({
        db: input.db,
        profileId: input.profileId,
        scope: input.scope,
        integration: { ...input.integration, provider: adapter.provider },
      });
    },
    enqueueInitialOnboardingWork: (input) => {
      if (input.integration.provider !== adapter.provider) {
        throw new Error("Provider adapter context mismatch");
      }
      return adapter.enqueueInitialOnboardingWork({
        ...input,
        integration: { ...input.integration, provider: adapter.provider },
      });
    },
  };
}

const executableAdapters = [
  toExecutableAdapter(wahooProviderOperationAdapter),
  toExecutableAdapter(stravaProviderOperationAdapter),
];

export const providerOperationRegistry = createProviderOperationRegistry<
  ExecutableIntegrationProviderId,
  ProviderOperationAdapter<ExecutableIntegrationProviderId>
>(executableAdapters);

export const getProviderOperationAdapter = (provider: PersistentIntegrationSourceId) => {
  const executableProvider = executableIntegrationProviderIdSchema.safeParse(provider);
  return executableProvider.success ? providerOperationRegistry.get(executableProvider.data) : null;
};

export const getExecutableProviderOperationAdapter = (
  provider: ExecutableIntegrationProviderId,
) => {
  const adapter = providerOperationRegistry.get(provider);
  return adapter?.isConfigured() ? adapter : null;
};

export const requireProviderOperationAdapter = (provider: ExecutableIntegrationProviderId) =>
  providerOperationRegistry.require(provider);

/** Catalog order is deterministic precedence when several adapters contribute profile evidence. */
export async function readConfiguredProviderSetupEvidence(input: {
  db: DrizzleDbClient;
  profileId: string;
}) {
  return Promise.all(
    providerOperationRegistry.configured().map(async (adapter) => ({
      provider: adapter.provider,
      evidence: await adapter.readSetupEvidence(input),
    })),
  );
}
