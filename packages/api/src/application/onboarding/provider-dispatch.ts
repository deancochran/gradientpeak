import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../db";
import type { OnboardingProviderWorkSnapshot } from "../../repositories/onboarding-lifecycle-repository";
import type { ProviderTransactionalOperationContext } from "../integrations/provider-operation-registry";

export async function dispatchInitialOnboardingWork<TProvider extends string>(input: {
  adapters: ReadonlyMap<
    TProvider,
    {
      enqueueInitialOnboardingWork: (
        operation: ProviderTransactionalOperationContext<TProvider>,
      ) => Promise<{ historyJobId: string; profileJobId: string | null }>;
    }
  >;
  db: DrizzleDbClient;
  profileId: string;
  providers: Array<OnboardingProviderWorkSnapshot & { provider: TProvider }>;
  transaction: DrizzleTransactionClient;
}) {
  for (const provider of input.providers) {
    const adapter = input.adapters.get(provider.provider);
    if (!adapter) throw new Error("Connected provider has no executable operation adapter");
    await adapter.enqueueInitialOnboardingWork({
      db: input.db,
      profileId: input.profileId,
      integration: {
        id: provider.id,
        generation: provider.generation,
        provider: provider.provider,
        lifecycleStatus: provider.active ? "active" : "disconnected",
      },
      scope: provider.scope,
      transaction: input.transaction,
    });
  }
}
