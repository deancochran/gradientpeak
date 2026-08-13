import type { getRequiredDb } from "../../db";
import {
  hasPendingOnboardingOAuthState,
  listExecutableOnboardingProviders,
  lockOnboardingProfile,
  OnboardingPendingOAuthError,
  OnboardingStatusConflictError,
  readOnboardingReadinessSnapshot,
  setOnboardingStatus,
} from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import { requireProviderOperationAdapter } from "../integrations/provider-operation-runtime";
import { dispatchInitialOnboardingWork } from "./provider-dispatch";

type Db = ReturnType<typeof getRequiredDb>;

export async function startOnboardingProcessing(input: { db: Db; profileId: string }) {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (profile.onboarding_status === "processing" || profile.onboarding_status === "review") {
      const providers =
        (await readOnboardingReadinessSnapshot(tx, input.profileId))?.providers ?? [];
      return {
        status: profile.onboarding_status,
        providers: providers.map((provider) => provider.provider),
      };
    }
    if (profile.onboarding_status !== "provider_selection") {
      throw new OnboardingStatusConflictError(["provider_selection"], profile.onboarding_status);
    }
    if (await hasPendingOnboardingOAuthState(tx, input.profileId)) {
      throw new OnboardingPendingOAuthError();
    }
    const providers = await listExecutableOnboardingProviders(tx, input.profileId);
    try {
      await dispatchInitialOnboardingWork({
        adapters: new Map(
          providers.map((provider) => [
            provider.provider,
            requireProviderOperationAdapter(provider.provider),
          ]),
        ),
        db: input.db,
        profileId: input.profileId,
        providers: providers.map((provider) => ({
          ...provider,
          active: true,
          importRun: null,
          jobs: [],
        })),
        transaction: tx,
      });
    } catch (error) {
      if (isProviderWorkOwnershipConflict(error)) throw new OnboardingWorkOwnershipConflictError();
      throw error;
    }
    const status: "processing" | "review" = providers.length === 0 ? "review" : "processing";
    await setOnboardingStatus(tx, input.profileId, status);
    return { status, providers: providers.map((provider) => provider.provider) };
  });
}

function isProviderWorkOwnershipConflict(error: unknown) {
  return error instanceof Error && error.name === "OnboardingProviderWorkConflictError";
}

export class OnboardingWorkOwnershipConflictError extends Error {
  constructor() {
    super("Existing provider work must finish before onboarding processing can start");
    this.name = "OnboardingWorkOwnershipConflictError";
  }
}
