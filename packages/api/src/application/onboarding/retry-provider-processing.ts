import type { ExecutableIntegrationProviderId } from "@repo/core";
import { providerSyncJobs } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  lockOnboardingProfile,
  OnboardingStatusConflictError,
  readOnboardingReadinessSnapshot,
} from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import { getExecutableProviderOperationAdapter } from "../integrations/provider-operation-runtime";
import { deriveOnboardingProviderState } from "./readiness";

type Db = ReturnType<typeof getRequiredDb>;

export class OnboardingProviderRecoveryConflictError extends Error {
  constructor(message = "Provider onboarding work is not eligible for recovery") {
    super(message);
    this.name = OnboardingProviderRecoveryConflictError.name;
  }
}

export async function retryOnboardingProviderProcessing(input: {
  db: Db;
  profileId: string;
  provider: ExecutableIntegrationProviderId;
}) {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (profile.onboarding_status !== "processing") {
      throw new OnboardingStatusConflictError(["processing"], profile.onboarding_status);
    }

    const snapshot = await readOnboardingReadinessSnapshot(tx, input.profileId);
    const provider = snapshot?.providers.find((item) => item.provider === input.provider);
    if (!snapshot || !provider) {
      throw new OnboardingProviderRecoveryConflictError("Anchored onboarding provider not found");
    }

    const adapter = getExecutableProviderOperationAdapter(provider.provider);
    if (!adapter) {
      throw new OnboardingProviderRecoveryConflictError(
        "Provider processing is unavailable; return to account selection",
      );
    }
    const state = deriveOnboardingProviderState(provider, snapshot.athleteState, () => adapter);
    if (["queued", "importing", "deriving"].includes(state)) {
      return { provider: input.provider, status: "processing" as const, queued: false };
    }
    if (state !== "recovery_required") throw new OnboardingProviderRecoveryConflictError();

    adapter.admitOnboardingRetry({
      profileId: input.profileId,
      work: {
        active: provider.active,
        generation: provider.generation,
        integrationId: provider.id,
        scope: provider.scope,
        jobs: provider.jobs.map((job) => ({
          id: job.id,
          jobType: job.job_type,
          status: job.status,
        })),
      },
    });
    const roles = adapter.identifyOnboardingWork({
      jobs: provider.jobs.map((job) => ({
        id: job.id,
        importRunId: job.import_run_id,
        jobType: job.job_type,
        payloadImportRunId: job.payload_import_run_id,
        status: job.status,
      })),
    });
    const historyJob = provider.jobs.find((job) => job.id === roles.historyJobId);
    const profileJob = provider.jobs.find((job) => job.id === roles.profileJobId);
    if (!provider.active || !historyJob || (roles.profileJobId !== null && !profileJob)) {
      throw new OnboardingProviderRecoveryConflictError(
        "Anchored provider work cannot be replaced during recovery",
      );
    }
    // Re-admit the same durable work identities. Terminal jobs are reset in place so an attached
    // failed import run is resumed by the history worker instead of being orphaned by a fresh job.
    let queued = false;
    if (
      historyJob &&
      ["failed", "dead_lettered"].includes(historyJob.status) &&
      provider.importRun?.status !== "cancelled"
    ) {
      const [retried] = await tx
        .update(providerSyncJobs)
        .set({
          attempt: 0,
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          run_at: new Date(),
          status: "queued",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(providerSyncJobs.id, historyJob.id),
            eq(providerSyncJobs.profile_id, input.profileId),
            eq(providerSyncJobs.integration_id, provider.id),
            eq(providerSyncJobs.integration_generation, provider.generation),
            inArray(providerSyncJobs.status, ["failed", "dead_lettered"]),
          ),
        )
        .returning({ id: providerSyncJobs.id });
      queued = Boolean(retried);
    } else if (provider.importRun?.status === "cancelled") {
      throw new OnboardingProviderRecoveryConflictError(
        "The anchored import run cannot be replaced; repair the linked run before retrying",
      );
    }
    if (profileJob && ["failed", "dead_lettered"].includes(profileJob.status)) {
      const [retried] = await tx
        .update(providerSyncJobs)
        .set({
          attempt: 0,
          last_error: null,
          lock_expires_at: null,
          locked_at: null,
          locked_by: null,
          run_at: new Date(),
          status: "queued",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(providerSyncJobs.id, profileJob.id),
            eq(providerSyncJobs.profile_id, input.profileId),
            eq(providerSyncJobs.integration_id, provider.id),
            eq(providerSyncJobs.integration_generation, provider.generation),
            inArray(providerSyncJobs.status, ["failed", "dead_lettered"]),
          ),
        )
        .returning({ id: providerSyncJobs.id });
      queued = Boolean(retried) || queued;
    }

    return { provider: input.provider, status: "processing" as const, queued };
  });
}
