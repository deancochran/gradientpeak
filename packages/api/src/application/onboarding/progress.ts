import { executableIntegrationProviderIdValues, getProviderCapabilityDefinition } from "@repo/core";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import {
  type OnboardingProviderWorkSnapshot,
  type OnboardingReadinessSnapshot,
  readOnboardingReadinessSnapshot,
} from "../../repositories/onboarding-lifecycle-repository";
import { getProviderOperationAdapter } from "../integrations/provider-operation-runtime";
import {
  deriveOnboardingReadiness,
  type OnboardingProviderState,
  type OnboardingReadiness,
} from "./readiness";

type Db = ReturnType<typeof getRequiredDb>;

export const onboardingProgressSchema = z
  .object({
    status: z.enum(["provider_selection", "processing", "review", "completed"]),
    phase: z.enum([
      "preparing_accounts",
      "importing_activities",
      "building_targets",
      "ready",
      "recovery_required",
    ]),
    percent: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]),
    message: z.string().min(1).max(160),
    detail: z.string().min(1).max(240).nullable(),
    provider_summary: z.array(
      z
        .object({
          provider: z.enum(executableIntegrationProviderIdValues),
          label: z.string().min(1).max(80),
          state: z.enum(["waiting", "working", "complete", "needs_attention"]),
        })
        .strict(),
    ),
    recovery: z
      .object({
        provider: z.enum(executableIntegrationProviderIdValues),
        label: z.string().min(1).max(80),
        action: z.enum(["retry", "restart_selection"]),
        message: z.string().min(1).max(200),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type OnboardingProgress = z.infer<typeof onboardingProgressSchema>;
type Milestone = OnboardingProgress["percent"];

const terminalStates = new Set<OnboardingProviderState>([
  "complete",
  "complete_no_data",
  "complete_with_limitations",
]);

function providerMilestone(state: OnboardingProviderState, importedCount: number): Milestone {
  if (state === "importing") return 50;
  // A queued retry after an imported history must not make the visible progress move backwards.
  if (state === "queued" && importedCount > 0) return 50;
  if (state === "deriving") return 75;
  if (terminalStates.has(state)) return 100;
  return 25;
}

export function deriveRecoveryMilestone(provider: OnboardingProviderWorkSnapshot): Milestone {
  const adapter = getProviderOperationAdapter(provider.provider);
  const work = adapter?.identifyOnboardingWork({
    jobs: provider.jobs.map((job) => ({
      id: job.id,
      importRunId: job.import_run_id,
      jobType: job.job_type,
      payloadImportRunId: job.payload_import_run_id,
      status: job.status,
    })),
  });
  const requiredWorkCompleted = Boolean(
    work?.importRunLinked &&
      provider.importRun?.status === "completed" &&
      work.requiredJobTypes.every((jobType) =>
        provider.jobs.some((job) => job.job_type === jobType && job.status === "completed"),
      ),
  );
  if (requiredWorkCompleted) return 75;

  const historyJob = provider.jobs.find((job) => job.id === work?.historyJobId);
  if (
    provider.importRun !== null ||
    historyJob?.status === "running" ||
    historyJob?.status === "completed"
  ) {
    return 50;
  }
  return 25;
}

function providerPresentationState(state: OnboardingProviderState) {
  if (state === "recovery_required") return "needs_attention" as const;
  if (terminalStates.has(state)) return "complete" as const;
  if (state === "importing" || state === "deriving") return "working" as const;
  return "waiting" as const;
}

function countDetail(readiness: OnboardingReadiness, phase: OnboardingProgress["phase"]) {
  const imported = readiness.providers.reduce(
    (total, provider) => total + provider.progress.imported_count,
    0,
  );
  const parts: string[] = [];
  if (imported > 0) {
    parts.push(
      `${imported} ${imported === 1 ? "activity" : "activities"} imported${phase === "importing_activities" ? " so far" : ""}`,
    );
  }
  if (parts.length > 0) return `${parts.join(" · ")}.`;
  if (phase === "ready") return "No activities were available to import.";
  if (phase === "preparing_accounts") {
    const count = readiness.providers.length;
    return `${count} connected ${count === 1 ? "account is" : "accounts are"} queued.`;
  }
  return null;
}

export function deriveOnboardingProgress(
  readiness: OnboardingReadiness,
  recoveryMilestones: ReadonlyMap<string, Milestone> = new Map(),
): OnboardingProgress {
  const orderedProviders = readiness.providers
    .map((provider, anchorIndex) => ({
      ...provider,
      anchorIndex,
    }))
    .sort((left, right) => {
      const leftIndex = executableIntegrationProviderIdValues.indexOf(left.provider);
      const rightIndex = executableIntegrationProviderIdValues.indexOf(right.provider);
      return leftIndex - rightIndex || left.anchorIndex - right.anchorIndex;
    });
  const providerSummary = orderedProviders.map((provider) => ({
    provider: provider.provider,
    label: getProviderCapabilityDefinition(provider.provider).label,
    state: providerPresentationState(provider.state),
  }));
  const recoveryProvider = orderedProviders.find(
    (provider) => provider.state === "recovery_required",
  );

  if (readiness.status === "provider_selection") {
    return onboardingProgressSchema.parse({
      status: readiness.status,
      phase: "preparing_accounts",
      percent: 25,
      message: "Choose any accounts you want to connect.",
      detail: null,
      provider_summary: providerSummary,
      recovery: null,
    });
  }

  if (readiness.status === "review" || readiness.status === "completed") {
    return onboardingProgressSchema.parse({
      status: readiness.status,
      phase: "ready",
      percent: 100,
      message: "Your starting point is ready.",
      detail: countDetail(readiness, "ready"),
      provider_summary: providerSummary,
      recovery: null,
    });
  }

  if (!recoveryProvider && readiness.status === "processing" && orderedProviders.length === 0) {
    return onboardingProgressSchema.parse({
      status: readiness.status,
      phase: "recovery_required",
      percent: 25,
      message: "Connected account preparation needs attention before setup can continue.",
      detail: null,
      provider_summary: [],
      recovery: {
        provider: executableIntegrationProviderIdValues[0],
        label: getProviderCapabilityDefinition(executableIntegrationProviderIdValues[0]).label,
        action: "restart_selection",
        message: "Return to account selection to reconnect or choose another account.",
      },
    });
  }

  if (recoveryProvider) {
    const label = getProviderCapabilityDefinition(recoveryProvider.provider).label;
    const action = recoveryProvider.next_actions.includes("retry")
      ? ("retry" as const)
      : ("restart_selection" as const);
    const milestones = orderedProviders
      .filter((provider) => !terminalStates.has(provider.state))
      .map((provider) =>
        provider.state === "recovery_required"
          ? (recoveryMilestones.get(provider.provider) ?? 25)
          : providerMilestone(provider.state, provider.progress.imported_count),
      );
    const percent = (milestones.length > 0 ? Math.min(...milestones) : 25) as Milestone;
    const message = `${label} needs attention before setup can continue.`;
    return onboardingProgressSchema.parse({
      status: readiness.status,
      phase: "recovery_required",
      percent,
      message,
      detail: countDetail(readiness, "recovery_required"),
      provider_summary: providerSummary,
      recovery: {
        provider: recoveryProvider.provider,
        label,
        action,
        message:
          action === "retry"
            ? `Retry ${label} preparation to continue.`
            : "Return to account selection to reconnect or choose another account.",
      },
    });
  }

  if (
    orderedProviders.length > 0 &&
    orderedProviders.every((provider) => terminalStates.has(provider.state))
  ) {
    return onboardingProgressSchema.parse({
      status: readiness.status,
      phase: "building_targets",
      percent: 75,
      message: "Finalizing your starting point.",
      detail: countDetail(readiness, "building_targets"),
      provider_summary: providerSummary,
      recovery: null,
    });
  }

  const unresolvedMilestones = orderedProviders
    .filter((provider) => !terminalStates.has(provider.state))
    .map((provider) => providerMilestone(provider.state, provider.progress.imported_count));
  const percent = (
    unresolvedMilestones.length > 0 ? Math.min(...unresolvedMilestones) : 100
  ) as Milestone;
  const phase =
    percent === 25
      ? ("preparing_accounts" as const)
      : percent === 50
        ? ("importing_activities" as const)
        : percent === 75
          ? ("building_targets" as const)
          : ("ready" as const);
  const message = {
    preparing_accounts: "Preparing your connected accounts.",
    importing_activities: "Importing your activity history.",
    building_targets: "Building your starting targets.",
    ready: "Your starting point is ready.",
  }[phase];

  return onboardingProgressSchema.parse({
    status: readiness.status,
    phase,
    percent,
    message,
    detail: countDetail(readiness, phase),
    provider_summary: providerSummary,
    recovery: null,
  });
}

export function projectOnboardingProgress(snapshot: OnboardingReadinessSnapshot) {
  const readiness = deriveOnboardingReadiness(snapshot);
  const milestones = new Map(
    snapshot.providers.map((provider) => [provider.provider, deriveRecoveryMilestone(provider)]),
  );
  return deriveOnboardingProgress(readiness, milestones);
}

export async function getOnboardingProgress(input: { db: Db; profileId: string }) {
  const snapshot = await readOnboardingReadinessSnapshot(input.db, input.profileId);
  return snapshot ? projectOnboardingProgress(snapshot) : null;
}
