import { activityImportRuns, providerSyncJobs } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  lockOnboardingProfile,
  OnboardingStatusConflictError,
  readOnboardingReadinessSnapshot,
  setOnboardingStatus,
} from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import {
  getExecutableProviderOperationAdapter,
  getProviderOperationAdapter,
} from "../integrations/provider-operation-runtime";
import { deriveOnboardingProviderState } from "./readiness";

type Db = ReturnType<typeof getRequiredDb>;

export class OnboardingRestartConflictError extends Error {
  constructor(
    message = "Provider selection can restart only when anchored onboarding work needs recovery",
  ) {
    super(message);
    this.name = OnboardingRestartConflictError.name;
  }
}

export async function restartOnboardingProviderSelection(input: { db: Db; profileId: string }) {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (profile.onboarding_status !== "processing") {
      throw new OnboardingStatusConflictError(["processing"], profile.onboarding_status);
    }
    const snapshot = await readOnboardingReadinessSnapshot(tx, input.profileId);
    if (!snapshot) throw new OnboardingRestartConflictError();
    // The locked readiness snapshot is the durable onboarding work-set authority. If processing
    // has lost every anchor there is no hidden provider work this command may terminate, and the
    // only fail-closed recovery is to reopen selection.
    if (snapshot.providers.length === 0) {
      await setOnboardingStatus(tx, input.profileId, "provider_selection");
      return { status: "provider_selection" as const };
    }
    if (
      !snapshot.providers.some(
        (provider) =>
          !getExecutableProviderOperationAdapter(provider.provider) ||
          deriveOnboardingProviderState(
            provider,
            snapshot.athleteState,
            getProviderOperationAdapter,
          ) === "recovery_required",
      )
    ) {
      throw new OnboardingRestartConflictError("Healthy provider processing cannot be restarted");
    }
    if (
      snapshot.providers.some((provider) => provider.jobs.some((job) => job.status === "running"))
    ) {
      throw new OnboardingRestartConflictError(
        "Provider work is still running; wait for it to stop before restarting selection",
      );
    }

    const now = new Date();
    for (const provider of snapshot.providers) {
      const jobIds = provider.jobs.map((job) => job.id);
      if (jobIds.length > 0) {
        await tx
          .update(providerSyncJobs)
          .set({
            last_error: "onboarding_selection_restarted",
            lock_expires_at: null,
            locked_at: null,
            locked_by: null,
            status: "dead_lettered",
            updated_at: now,
          })
          .where(
            and(
              eq(providerSyncJobs.profile_id, input.profileId),
              eq(providerSyncJobs.integration_id, provider.id),
              eq(providerSyncJobs.integration_generation, provider.generation),
              inArray(providerSyncJobs.id, jobIds),
              inArray(providerSyncJobs.status, ["queued", "failed", "dead_lettered"]),
            ),
          );
        await tx
          .update(providerSyncJobs)
          .set({ last_error: "onboarding_selection_restarted", updated_at: now })
          .where(
            and(
              eq(providerSyncJobs.profile_id, input.profileId),
              eq(providerSyncJobs.integration_id, provider.id),
              eq(providerSyncJobs.integration_generation, provider.generation),
              inArray(providerSyncJobs.id, jobIds),
              eq(providerSyncJobs.status, "completed"),
            ),
          );
      }
      const roles = getProviderOperationAdapter(provider.provider)?.identifyOnboardingWork({
        jobs: provider.jobs.map((job) => ({
          id: job.id,
          importRunId: job.import_run_id,
          jobType: job.job_type,
          payloadImportRunId: job.payload_import_run_id,
          status: job.status,
        })),
      });
      const history = provider.jobs.find((job) => job.id === roles?.historyJobId);
      if (history?.import_run_id && history.import_run_id !== history.payload_import_run_id) {
        throw new OnboardingRestartConflictError("Anchored import-run identity is malformed");
      }
      if (history?.import_run_id) {
        await tx
          .update(activityImportRuns)
          .set({
            completed_at: now,
            last_error_code: "onboarding_selection_restarted",
            status: "cancelled",
            updated_at: now,
          })
          .where(
            and(
              eq(activityImportRuns.id, history.import_run_id),
              eq(activityImportRuns.profile_id, input.profileId),
              eq(activityImportRuns.integration_id, provider.id),
              eq(activityImportRuns.integration_generation, provider.generation),
              inArray(activityImportRuns.status, ["queued", "failed", "cancelled"]),
            ),
          );
      }
    }
    await setOnboardingStatus(tx, input.profileId, "provider_selection");
    return { status: "provider_selection" as const };
  });
}
