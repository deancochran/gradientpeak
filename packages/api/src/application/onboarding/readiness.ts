import type { ExecutableIntegrationProviderId } from "@repo/core";
import type { OnboardingStatus } from "@repo/core/schemas/onboarding";
import type { getRequiredDb } from "../../db";
import {
  lockOnboardingProfile,
  type OnboardingReadinessSnapshot,
  readOnboardingReadinessSnapshot,
  setOnboardingStatus,
} from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";
import {
  getExecutableProviderOperationAdapter,
  getProviderOperationAdapter,
} from "../integrations/provider-operation-runtime";

type Db = ReturnType<typeof getRequiredDb>;

export type OnboardingProviderState =
  | "connected"
  | "queued"
  | "importing"
  | "deriving"
  | "complete"
  | "complete_no_data"
  | "complete_with_limitations"
  | "recovery_required";

export type OnboardingReadiness = {
  status: OnboardingStatus;
  ready_to_finalize: boolean;
  providers: Array<{
    provider: ExecutableIntegrationProviderId;
    state: OnboardingProviderState;
    progress: {
      imported_count: number;
      skipped_count: number;
      failed_count: number;
      profile: "queued" | "running" | "complete" | "recovery_required";
    };
    executable: boolean;
    integration_active: boolean;
    next_actions: Array<"wait" | "retry" | "restart_selection" | "review" | "finalize">;
  }>;
  next_actions: Array<
    "connect_provider" | "wait" | "retry" | "restart_selection" | "review" | "finalize"
  >;
};

type OnboardingWorkRoleResolver = Pick<
  NonNullable<ReturnType<typeof getProviderOperationAdapter>>,
  "identifyOnboardingWork"
>;

export function deriveOnboardingProviderState(
  provider: OnboardingReadinessSnapshot["providers"][number],
  athleteState: OnboardingReadinessSnapshot["athleteState"],
  getAdapter: (
    provider: ExecutableIntegrationProviderId,
  ) => OnboardingWorkRoleResolver | null = getProviderOperationAdapter,
): OnboardingProviderState {
  const jobs = provider.jobs;
  const adapter = getAdapter(provider.provider);
  if (!adapter) return "recovery_required";
  const work = adapter.identifyOnboardingWork({
    jobs: jobs.map((job) => ({
      id: job.id,
      importRunId: job.import_run_id,
      jobType: job.job_type,
      payloadImportRunId: job.payload_import_run_id,
      status: job.status,
    })),
  });
  if (!provider.active) return "recovery_required";
  if (jobs.length === 0) return "connected";
  // A failed queue job still has a scheduled retry. Reserve recovery for work that has exhausted
  // its retry budget, or for an import run whose durable result cannot progress safely. Individual
  // activity outcomes are intentionally non-blocking; completed imports may contain unsupported,
  // duplicate, or otherwise unusable provider activities.
  if (
    jobs.some((job) => job.status === "dead_lettered") ||
    provider.importRun?.status === "failed" ||
    provider.importRun?.status === "cancelled"
  ) {
    return "recovery_required";
  }
  if (jobs.some((job) => job.status === "running") || provider.importRun?.status === "running") {
    return "importing";
  }
  if (
    jobs.some((job) => job.status === "queued" || job.status === "failed") ||
    provider.importRun?.status === "queued"
  ) {
    return "queued";
  }
  if (
    work.requiredJobTypes.some(
      (jobType) => !jobs.some((job) => job.job_type === jobType && job.status === "completed"),
    ) ||
    provider.importRun?.status !== "completed" ||
    !work.importRunLinked
  ) {
    return "recovery_required";
  }
  const unpublishedCurrentState =
    !athleteState ||
    (athleteState.published_revision !== athleteState.source_revision &&
      (athleteState.dirty_from_at === undefined ||
        athleteState.dirty_from_at === null ||
        athleteState.dirty_from_at.getTime() <= Date.now()));
  if (provider.importRun.material_change_count > 0 && unpublishedCurrentState) {
    return "deriving";
  }
  if (provider.importRun.imported_count === 0) return "complete_no_data";
  return "complete";
}

export function deriveOnboardingReadiness(
  snapshot: OnboardingReadinessSnapshot,
  getAdapter: (
    provider: ExecutableIntegrationProviderId,
  ) => OnboardingWorkRoleResolver | null = getProviderOperationAdapter,
  isExecutable: (provider: ExecutableIntegrationProviderId) => boolean = (provider) =>
    Boolean(getExecutableProviderOperationAdapter(provider)),
): OnboardingReadiness {
  const providers = snapshot.providers.map((provider) => {
    const executable = isExecutable(provider.provider);
    const state = executable
      ? deriveOnboardingProviderState(provider, snapshot.athleteState, getAdapter)
      : "recovery_required";
    const adapter = getAdapter(provider.provider);
    const roles = adapter?.identifyOnboardingWork({
      jobs: provider.jobs.map((job) => ({
        id: job.id,
        importRunId: job.import_run_id,
        jobType: job.job_type,
        payloadImportRunId: job.payload_import_run_id,
        status: job.status,
      })),
    });
    const profileJob = provider.jobs.find((job) => job.id === roles?.profileJobId);
    return {
      provider: provider.provider,
      state,
      executable,
      integration_active: provider.active,
      progress: {
        imported_count: provider.importRun?.imported_count ?? 0,
        skipped_count: provider.importRun?.skipped_count ?? 0,
        failed_count: provider.importRun?.failed_count ?? 0,
        profile:
          profileJob?.status === "completed"
            ? ("complete" as const)
            : profileJob?.status === "running"
              ? ("running" as const)
              : profileJob?.status === "queued" || profileJob?.status === "failed"
                ? ("queued" as const)
                : ("recovery_required" as const),
      },
      next_actions: [
        ...(state === "recovery_required"
          ? executable && provider.active
            ? (["retry", "restart_selection"] as const)
            : (["restart_selection"] as const)
          : ["connected", "queued", "importing", "deriving"].includes(state)
            ? (["wait"] as const)
            : (["review"] as const)),
      ],
    };
  });
  const missingProcessingAnchor =
    snapshot.profile.onboarding_status === "processing" && providers.length === 0;
  const readyProviders =
    !missingProcessingAnchor &&
    providers.every((provider) =>
      ["complete", "complete_no_data", "complete_with_limitations"].includes(provider.state),
    );
  const noProviderSelectionComplete =
    snapshot.providers.length === 0 && snapshot.profile.onboarding_status === "review";
  const readyToFinalize =
    snapshot.profile.onboarding_status === "review" &&
    readyProviders &&
    (providers.length > 0 || noProviderSelectionComplete);
  const nextActions = readyToFinalize
    ? (["finalize"] as const)
    : missingProcessingAnchor ||
        providers.some((provider) => provider.state === "recovery_required")
      ? providers.some((provider) => provider.next_actions.includes("retry"))
        ? (["retry", "restart_selection"] as const)
        : (["restart_selection"] as const)
      : snapshot.profile.onboarding_status === "provider_selection"
        ? (["connect_provider"] as const)
        : snapshot.profile.onboarding_status === "processing"
          ? (["wait"] as const)
          : (["review"] as const);
  return {
    status: snapshot.profile.onboarding_status,
    ready_to_finalize: readyToFinalize,
    providers,
    next_actions: [...nextActions],
  };
}

export async function getOnboardingReadiness(input: { db: Db; profileId: string }) {
  const snapshot = await readOnboardingReadinessSnapshot(input.db, input.profileId);
  return snapshot ? deriveOnboardingReadiness(snapshot) : null;
}

/** Explicit idempotent command; readiness queries remain strictly read-only. */
export async function reconcileOnboardingStatus(input: { db: Db; profileId: string }) {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    const snapshot = await readOnboardingReadinessSnapshot(tx, input.profileId);
    if (!snapshot) return null;
    let readiness = deriveOnboardingReadiness(snapshot);
    const allProvidersTerminal =
      readiness.providers.length > 0 &&
      readiness.providers.every((provider) =>
        ["complete", "complete_no_data", "complete_with_limitations"].includes(provider.state),
      );
    if (profile.onboarding_status === "processing" && allProvidersTerminal) {
      await setOnboardingStatus(tx, input.profileId, "review");
      readiness = deriveOnboardingReadiness({
        ...snapshot,
        profile: { ...snapshot.profile, onboarding_status: "review" },
      });
    }
    return readiness;
  });
}
