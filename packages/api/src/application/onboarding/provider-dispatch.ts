import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../db";
import type { OnboardingProviderWorkSnapshot } from "../../repositories/onboarding-lifecycle-repository";
import type { ProviderTransactionalRuntimeContext } from "../integrations/provider-runtime";

export async function dispatchInitialOnboardingWork<TProvider extends string>(input: {
  runtimes: ReadonlyMap<
    TProvider,
    {
      enqueueInitialOnboardingWork: (
        operation: ProviderTransactionalRuntimeContext,
      ) => Promise<{ historyJobId: string; profileJobId: string | null }>;
    }
  >;
  db: DrizzleDbClient;
  profileId: string;
  providers: Array<OnboardingProviderWorkSnapshot & { provider: TProvider }>;
  transaction: DrizzleTransactionClient;
}) {
  for (const provider of input.providers) {
    const runtime = input.runtimes.get(provider.provider);
    if (!runtime) throw new Error("Connected provider has no executable onboarding runtime");
    await runtime.enqueueInitialOnboardingWork({
      db: input.db,
      profileId: input.profileId,
      integration: {
        id: provider.id,
        generation: provider.generation,
        lifecycleStatus: provider.active ? "active" : "disconnected",
      },
      scope: provider.scope,
      transaction: input.transaction,
    });
  }
}
