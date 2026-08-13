import type { ExecutableIntegrationProviderId } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import {
  createProviderOperationRegistry,
  type ProviderOperationAdapter,
} from "./provider-operation-registry";
import { wahooProviderOperationAdapter } from "./wahoo-provider-operation-adapter";

export const providerOperationRegistry = createProviderOperationRegistry<
  ExecutableIntegrationProviderId,
  ProviderOperationAdapter<ExecutableIntegrationProviderId>
>([wahooProviderOperationAdapter]);

export const getProviderOperationAdapter = (provider: ExecutableIntegrationProviderId) =>
  providerOperationRegistry.get(provider);

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
