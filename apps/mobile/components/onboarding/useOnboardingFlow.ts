import {
  buildGoalCreatePayload,
  type ExecutableIntegrationProviderId,
  getGoalDraftQualityFeedback,
  type OnboardingStatus,
  profileTrainingSettingsRecordSchema,
} from "@repo/core";
import { estimateMaxHRFromDOB } from "@repo/core/estimators";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { invalidateOnboardingSocialQueries } from "@/lib/groups/invalidation";
import { useAuth } from "@/lib/hooks/useAuth";
import { buildCompleteOnboardingInput } from "@/lib/onboarding/complete-onboarding-input";
import {
  clearOnboardingRecovery,
  createCompletedOnboardingRecovery,
  loadOnboardingRecovery,
  ONBOARDING_RECOVERY_VERSION,
  type OnboardingRecoveryGoal,
  OnboardingRecoveryPayloadTooLargeError,
  type OnboardingRecoveryRecord,
  type OnboardingRecoverySection,
  onboardingRecoveryExpiry,
  type PendingOnboardingRecoveryRecord,
  saveOnboardingRecovery,
} from "@/lib/onboarding/onboarding-recovery";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import { resolveOnboardingLifecycleStatus } from "./lifecycle-status";
import { getCompactTrainingPreferencesValue, INITIAL_ONBOARDING_DATA } from "./onboarding-data";
import {
  onboardingOverviewEnabled,
  onboardingProgressRefetchInterval,
} from "./processing-query-policy";
import { runOnboardingRecoveryAction } from "./recovery-actions";
import type { OnboardingData, OnboardingFieldSources, OnboardingStatusModal } from "./types";

type SocialActionJob = { key: string; run: () => Promise<unknown> };

export async function runSocialActionsWithLimit(jobs: SocialActionJob[], limit = 4) {
  const results: Array<{ key: string; status: "saved" | "failed" }> = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex++];
      if (!job) return;
      try {
        await job.run();
        results.push({ key: job.key, status: "saved" });
      } catch {
        results.push({ key: job.key, status: "failed" });
      }
    }
  });
  await Promise.allSettled(workers);
  return results;
}

export function useOnboardingFlow() {
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [touchedFields, setTouchedFields] = useState<Set<keyof OnboardingData>>(() => new Set());
  const [clearedFields, setClearedFields] = useState<Set<keyof OnboardingData>>(() => new Set());
  const [fieldSources, setFieldSources] = useState<OnboardingFieldSources>({});
  const [statusModal, setStatusModal] = useState<OnboardingStatusModal | null>(null);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(true);
  const [lifecycleOverride, setLifecycleOverride] = useState<OnboardingStatus | null>(null);
  const completionInFlightRef = useRef(false);
  const reviewHydrationStartedRef = useRef(false);
  const localCompletionStartedRef = useRef(false);
  const excludedSocialActionKeysRef = useRef(new Set<string>());
  const recoveryRef = useRef<OnboardingRecoveryRecord | null>(null);
  const restoredRecoveryRef = useRef(false);
  const recoveryIdentityRef = useRef<string | undefined>(undefined);
  const {
    completeOnboarding,
    isAuthenticated,
    isFullyLoaded,
    onboardingStatus,
    refreshOnboardingStatus,
    user,
  } = useAuth();
  const recoveryUserId = user?.id;
  const profileQueryEnabled = isFullyLoaded && isAuthenticated && hasSessionAuthCredentials();
  const profileLifecycleStatus = resolveOnboardingLifecycleStatus({
    overrideStatus: lifecycleOverride,
    profileStatus: onboardingStatus,
  });
  const { data: profile } = api.profiles.get.useQuery(undefined, {
    enabled: profileQueryEnabled,
  });
  const profileSettingsQuery = api.profileSettings.getForProfile.useQuery(
    { profile_id: profile?.id ?? "" },
    { enabled: profileQueryEnabled && !!profile?.id },
  );
  const username = data.username.trim();
  const usernameIsReadyToCheck =
    isValidOnboardingUsername(username) && debouncedUsername === username;
  const usernameAvailabilityQuery = api.onboarding.checkUsernameAvailability.useQuery(
    { username: debouncedUsername },
    { enabled: profileQueryEnabled && usernameIsReadyToCheck },
  );
  const utils = api.useUtils();
  const syncOverviewQuery = api.integrations.getSyncOverview.useQuery(undefined, {
    enabled: onboardingOverviewEnabled({
      authenticated: profileQueryEnabled,
      status: onboardingStatus,
    }),
    refetchInterval: (query) =>
      query.state.data?.some((provider) => provider.setupData.status === "refreshing")
        ? 1000
        : false,
  });
  const progressQuery = api.onboarding.getProgress.useQuery(undefined, {
    enabled: profileQueryEnabled && profileLifecycleStatus === "processing",
    refetchInterval: (query) => onboardingProgressRefetchInterval(query.state.data ?? {}),
  });
  const completeLifecycleSetupMutation = api.onboarding.completeLifecycleSetup.useMutation();
  const startProcessingMutation = api.onboarding.startProcessing.useMutation();
  const retryProviderProcessingMutation = api.onboarding.retryProviderProcessing.useMutation();
  const cancelPendingOAuthMutation = api.integrations.cancelPendingOAuth.useMutation();
  const restartProviderSelectionMutation = api.onboarding.restartProviderSelection.useMutation();
  const acceptInviteMutation = api.groups.acceptInvite.useMutation();
  const joinOrRequestGroupMutation = api.groups.joinOrRequest.useMutation();
  const followProfileMutation = api.social.followUser.useMutation();

  useLayoutEffect(() => {
    if (recoveryIdentityRef.current === recoveryUserId) return;

    recoveryIdentityRef.current = recoveryUserId;
    recoveryRef.current = null;
    restoredRecoveryRef.current = false;
    completionInFlightRef.current = false;
    localCompletionStartedRef.current = false;
    reviewHydrationStartedRef.current = false;
    excludedSocialActionKeysRef.current = new Set();
    setData(INITIAL_ONBOARDING_DATA);
    setIsSubmitting(false);
    setLifecycleOverride(null);
    setDebouncedUsername("");
    setTouchedFields(new Set());
    setClearedFields(new Set());
    setFieldSources({});
    setStatusModal(null);
    setIsRecoveryLoading(Boolean(recoveryUserId));
  }, [recoveryUserId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Modal helpers consume the record passed by this identity-scoped load and must not restart it on render.
  useEffect(() => {
    if (!isFullyLoaded) return;

    if (!isAuthenticated || !recoveryUserId) {
      setIsRecoveryLoading(false);
      return;
    }

    if (onboardingStatus !== "completed") {
      setIsRecoveryLoading(false);
      void clearOnboardingRecovery(recoveryUserId).catch(() => undefined);
      return;
    }

    const profileFullName = profile?.full_name;
    const profileUsername = profile?.username;
    if (!profileFullName || !profileUsername) {
      setIsRecoveryLoading(true);
      return;
    }

    const recoveryOwnerId = recoveryUserId;
    let active = true;
    async function discardRecovery() {
      try {
        await clearOnboardingRecovery(recoveryOwnerId);
        recoveryRef.current = null;
        restoredRecoveryRef.current = false;
        setStatusModal(null);
      } catch (error) {
        console.error(error);
        setStatusModal({
          title: "Recovery could not be discarded",
          description:
            "The saved recovery could not be removed from this device. Retry before continuing.",
          primaryLabel: "Retry discard",
          onPrimary: discardRecovery,
        });
      }
    }
    const loadRecovery = () => {
      setIsRecoveryLoading(true);
      setStatusModal(null);
      return loadOnboardingRecovery(recoveryUserId).then(
        async (record) => {
          if (!active) return;
          recoveryRef.current = record;

          if (!record || record.status !== "pending") {
            if (record) void clearOnboardingRecovery(recoveryUserId).catch(() => undefined);
            restoredRecoveryRef.current = false;
            setIsRecoveryLoading(false);
            return;
          }

          restoredRecoveryRef.current = true;
          const recoveredData: OnboardingData = {
            ...INITIAL_ONBOARDING_DATA,
            full_name: profileFullName,
            username: profileUsername,
            experience_level: record.profileRetry.experienceLevel,
            intent: record.profileRetry.intents,
            selected_invitation_ids: record.social.invitationIds,
            selected_group_ids: record.social.groupIds,
            selected_follow_profile_ids: record.social.followProfileIds,
            social_action_statuses: record.social.statuses,
            should_create_goal: Boolean(record.goal),
            should_save_training_preferences: Boolean(record.settingsPatch),
            training_preferences_patch: record.settingsPatch ?? {},
            training_preferences_hydration_status: "ready",
          };
          setData(recoveredData);
          setDebouncedUsername(profileUsername.trim());
          setFieldSources({});
          setTouchedFields(new Set());
          setClearedFields(new Set());
          excludedSocialActionKeysRef.current = new Set(
            Object.entries(record.social.statuses)
              .filter(([, actionStatus]) => actionStatus !== "pending" && actionStatus !== "failed")
              .map(([key]) => key),
          );
          setIsRecoveryLoading(false);

          const failedSocialKeys = Object.entries(record.social.statuses)
            .filter(([, actionStatus]) => actionStatus === "failed")
            .map(([key]) => key);
          if (failedSocialKeys.length > 0) {
            showSocialRecoveryModal(failedSocialKeys);
          } else if (
            record.social.invitationIds.length === 0 &&
            record.social.groupIds.length === 0 &&
            record.social.followProfileIds.length === 0 &&
            (record.lifecycle.goal.status === "failed" ||
              record.lifecycle.settings.status === "failed")
          ) {
            showLifecycleRecoveryModal(record.lifecycle);
          }
        },
        () => {
          if (!active) return;
          setIsRecoveryLoading(false);
          setStatusModal({
            title: "Recovery unavailable",
            description:
              "Setup recovery could not be loaded from this device. Retry, or discard local recovery and continue with your completed profile.",
            primaryLabel: "Retry",
            onPrimary: loadRecovery,
            secondaryLabel: "Discard recovery",
            onSecondary: discardRecovery,
          });
        },
      );
    };
    void loadRecovery();

    return () => {
      active = false;
    };
  }, [
    isAuthenticated,
    isFullyLoaded,
    onboardingStatus,
    profile?.full_name,
    profile?.username,
    recoveryUserId,
  ]);

  const updateData = useCallback(
    (
      updates: Partial<OnboardingData>,
      options?: {
        source?: "estimated" | "imported" | "user";
        sourceLabels?: Partial<Record<keyof OnboardingData, string>>;
      },
    ) => {
      if (options?.source !== "imported" && options?.source !== "estimated") {
        setTouchedFields((prev) => {
          const next = new Set(prev);
          Object.keys(updates).forEach((key) => {
            next.add(key as keyof OnboardingData);
          });
          return next;
        });

        setClearedFields((prev) => {
          const next = new Set(prev);

          Object.entries(updates).forEach(([key, value]) => {
            const field = key as keyof OnboardingData;
            if (value === null) {
              next.add(field);
            } else {
              next.delete(field);
            }
          });

          return next;
        });
      }

      setFieldSources((previous) => {
        const next = { ...previous };
        for (const [key, value] of Object.entries(updates)) {
          const field = key as keyof OnboardingData;
          next[field] =
            value === null
              ? { kind: "cleared" }
              : options?.source === "imported"
                ? { kind: "imported", label: options.sourceLabels?.[field] }
                : options?.source === "estimated"
                  ? { kind: "estimated" }
                  : { kind: "manual" };
        }
        return next;
      });

      setData((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  useEffect(() => {
    if (debouncedUsername === username) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setDebouncedUsername(username);
    }, 400);

    return () => clearTimeout(timeout);
  }, [debouncedUsername, username]);

  const refreshIntegrationState = useCallback(() => {
    return syncOverviewQuery.refetch();
  }, [syncOverviewQuery.refetch]);

  useEffect(() => {
    if (data.training_preferences_hydration_status !== "loading") {
      return;
    }

    if (profileSettingsQuery.isError) {
      updateData(
        {
          should_save_training_preferences: false,
          training_preferences_hydration_status: "error",
        },
        { source: "imported" },
      );
      return;
    }

    if (!profileSettingsQuery.isSuccess) {
      return;
    }

    if (profileSettingsQuery.data === null) {
      updateData(
        {
          should_save_training_preferences: true,
          training_preferences_hydration_status: "ready",
        },
        { source: "imported" },
      );
      return;
    }

    const parsed = profileTrainingSettingsRecordSchema.safeParse(profileSettingsQuery.data);
    if (!parsed.success) {
      updateData(
        {
          should_save_training_preferences: false,
          training_preferences_hydration_status: "error",
        },
        { source: "imported" },
      );
      return;
    }

    updateData(
      {
        should_save_training_preferences: true,
        training_settings: parsed.data.settings,
        compact_training_preferences: getCompactTrainingPreferencesValue(parsed.data.settings),
        training_preferences_hydration_status: "ready",
        training_preferences_error: null,
      },
      { source: "imported" },
    );
  }, [
    data.training_preferences_hydration_status,
    profileSettingsQuery.data,
    profileSettingsQuery.isError,
    profileSettingsQuery.isSuccess,
    updateData,
  ]);

  const profileEvidenceOverview = syncOverviewQuery.data?.find(
    (provider) => provider.connected && provider.onboarding.evidence.profileDetails,
  );
  useEffect(() => {
    const importedValues = profileEvidenceOverview?.setupData;
    if (!importedValues) return;

    const updates: Partial<OnboardingData> = {};

    if (
      !touchedFields.has("dob") &&
      !clearedFields.has("dob") &&
      importedValues.values.dob !== undefined
    ) {
      updates.dob = importedValues.values.dob;
    }

    if (
      !touchedFields.has("gender") &&
      !clearedFields.has("gender") &&
      importedValues.values.gender !== undefined
    ) {
      updates.gender = importedValues.values.gender;
    }

    if (
      !touchedFields.has("weight_kg") &&
      !clearedFields.has("weight_kg") &&
      importedValues.values.weight_kg !== undefined
    ) {
      updates.weight_kg = importedValues.values.weight_kg;
    }

    if (Object.keys(updates).length > 0) {
      updateData(updates, {
        source: "imported",
        sourceLabels: Object.fromEntries(
          Object.keys(updates).map((field) => [
            field,
            importedValues.sources[field as keyof typeof importedValues.sources]?.label,
          ]),
        ),
      });
    }
  }, [clearedFields, profileEvidenceOverview?.setupData, touchedFields, updateData]);

  useEffect(() => {
    const updates: Partial<OnboardingData> = {};

    const estimatedMaxHr = estimateMaxHRFromDOB(data.dob);
    if (
      estimatedMaxHr &&
      (!touchedFields.has("max_hr") || fieldSources.max_hr?.kind === "estimated") &&
      fieldSources.max_hr?.kind !== "cleared" &&
      data.max_hr !== estimatedMaxHr
    ) {
      updates.max_hr = estimatedMaxHr;
    }

    if (Object.keys(updates).length > 0) {
      updateData(updates, { source: "estimated" });
    }
  }, [data.dob, data.max_hr, fieldSources.max_hr?.kind, touchedFields, updateData]);

  useEffect(() => {
    const updates: Partial<OnboardingData> = {};

    if (!touchedFields.has("full_name") && profile?.full_name) {
      updates.full_name = profile.full_name;
    }

    if (!touchedFields.has("username") && profile?.username) {
      updates.username = profile.username;
    }

    if (Object.keys(updates).length > 0) {
      updateData(updates, { source: "imported" });
    }
  }, [profile?.full_name, profile?.username, touchedFields, updateData]);

  const isBusy =
    isRecoveryLoading ||
    isSubmitting ||
    completeLifecycleSetupMutation.isPending ||
    startProcessingMutation.isPending ||
    retryProviderProcessingMutation.isPending ||
    restartProviderSelectionMutation.isPending;
  const retryProviderProcessing = async (provider: ExecutableIntegrationProviderId) => {
    if (retryProviderProcessingMutation.isPending || restartProviderSelectionMutation.isPending) {
      return;
    }
    await runOnboardingRecoveryAction({
      action: async () => {
        await retryProviderProcessingMutation.mutateAsync({ provider });
        await progressQuery.refetch();
      },
      setStatusModal,
      failure: {
        title: "Preparation could not be retried",
        description:
          "This preparation could not be restarted safely. Try again or return to account selection.",
      },
    });
  };
  const lifecycleStatus = resolveOnboardingLifecycleStatus({
    overrideStatus: lifecycleOverride,
    profileStatus: onboardingStatus,
    progressStatus: progressQuery.data?.status,
  });

  useEffect(() => {
    if (lifecycleOverride && onboardingStatus === lifecycleOverride) setLifecycleOverride(null);
  }, [lifecycleOverride, onboardingStatus]);

  useEffect(() => {
    if (lifecycleStatus !== "review" || reviewHydrationStartedRef.current) return;
    reviewHydrationStartedRef.current = true;
    void refreshOnboardingStatus();
  }, [lifecycleStatus, refreshOnboardingStatus]);

  const startProviderProcessing = async () => {
    try {
      const result = await startProcessingMutation.mutateAsync();
      setLifecycleOverride(result.status);
    } catch (error) {
      const pendingOAuth = Boolean(
        error &&
          typeof error === "object" &&
          "data" in error &&
          (error as { data?: { applicationErrorCode?: unknown } }).data?.applicationErrorCode ===
            "ONBOARDING_PENDING_OAUTH",
      );
      if (!pendingOAuth) {
        setStatusModal({
          title: "Processing could not start",
          description:
            error instanceof Error ? error.message : "Check the provider status and try again.",
        });
        return;
      }
      setStatusModal({
        title: "Connection still pending",
        description:
          "Finish the provider connection, or explicitly cancel it before continuing. It was not cancelled automatically.",
        primaryLabel: "Cancel pending connection",
        onPrimary: cancelPendingProviderConnection,
      });
      return;
    }
    await refreshOnboardingStatus();
    await progressQuery.refetch();
  };

  const cancelPendingProviderConnection = async () => {
    for (const integration of syncOverviewQuery.data ?? []) {
      await cancelPendingOAuthMutation.mutateAsync({ provider: integration.provider });
    }
    await syncOverviewQuery.refetch();
  };

  const restartProviderSelection = async () => {
    if (retryProviderProcessingMutation.isPending || restartProviderSelectionMutation.isPending) {
      return;
    }
    await runOnboardingRecoveryAction({
      action: async () => {
        const result = await restartProviderSelectionMutation.mutateAsync();
        setLifecycleOverride(result.status);
        utils.onboarding.getProgress.setData(undefined, undefined);
        await Promise.allSettled([
          refreshOnboardingStatus(),
          utils.onboarding.getProgress.invalidate(),
          syncOverviewQuery.refetch(),
        ]);
        utils.onboarding.getProgress.setData(undefined, undefined);
      },
      setStatusModal,
      failure: {
        title: "Account selection could not be reopened",
        description: "We could not safely reopen account selection. Try again in a moment.",
      },
    });
  };

  function sectionNeedsRetry(section: OnboardingRecoverySection): boolean {
    return section.status === "pending" || section.status === "failed";
  }

  function initialLifecycleFor(
    recoveryData: OnboardingData,
    goal: OnboardingRecoveryGoal | undefined,
  ): PendingOnboardingRecoveryRecord["lifecycle"] {
    const goalPending = Boolean(goal);
    const settingsPending =
      recoveryData.should_save_training_preferences &&
      recoveryData.training_preferences_hydration_status === "ready" &&
      (Object.keys(recoveryData.training_preferences_patch).length > 0 ||
        recoveryData.intent.length > 0);

    return {
      required: { status: "pending", retryable: true },
      goal: { status: goalPending ? "pending" : "skipped", retryable: goalPending },
      settings: {
        status: settingsPending ? "pending" : "skipped",
        retryable: settingsPending,
      },
    };
  }

  async function persistRecovery(
    nextData: OnboardingData,
    nextLifecycle?: PendingOnboardingRecoveryRecord["lifecycle"],
  ): Promise<PendingOnboardingRecoveryRecord> {
    if (!recoveryUserId) throw new Error("Authenticated user not found");

    const existing = recoveryRef.current?.status === "pending" ? recoveryRef.current : null;
    const draftGoalPayload =
      nextData.should_create_goal &&
      nextData.goal_draft &&
      getGoalDraftQualityFeedback({ draft: nextData.goal_draft }).canGuidePlan &&
      profile?.id
        ? buildGoalCreatePayload({ draft: nextData.goal_draft, profileId: profile.id })
        : null;
    const draftGoal = draftGoalPayload
      ? (({ profile_id: _profileId, ...goal }) => goal)(draftGoalPayload)
      : undefined;
    const provisionalGoal = draftGoal ?? existing?.goal;
    const provisionalSettingsPatch = nextData.should_save_training_preferences
      ? nextData.training_preferences_patch
      : existing?.settingsPatch;
    const lifecycle =
      nextLifecycle ?? existing?.lifecycle ?? initialLifecycleFor(nextData, provisionalGoal);
    const goal = sectionNeedsRetry(lifecycle.goal) ? provisionalGoal : undefined;
    const settingsPatch = sectionNeedsRetry(lifecycle.settings)
      ? provisionalSettingsPatch
      : undefined;
    const unresolvedSocial = {
      invitationIds: nextData.selected_invitation_ids.filter((id) =>
        ["pending", "failed"].includes(
          nextData.social_action_statuses[`invite:${id}`] ?? "pending",
        ),
      ),
      groupIds: nextData.selected_group_ids.filter((id) =>
        ["pending", "failed"].includes(nextData.social_action_statuses[`group:${id}`] ?? "pending"),
      ),
      followProfileIds: nextData.selected_follow_profile_ids.filter((id) =>
        ["pending", "failed"].includes(
          nextData.social_action_statuses[`follow:${id}`] ?? "pending",
        ),
      ),
    };
    const unresolvedKeys = [
      ...unresolvedSocial.invitationIds.map((id) => `invite:${id}`),
      ...unresolvedSocial.groupIds.map((id) => `group:${id}`),
      ...unresolvedSocial.followProfileIds.map((id) => `follow:${id}`),
    ];
    const record: PendingOnboardingRecoveryRecord = {
      version: ONBOARDING_RECOVERY_VERSION,
      userId: recoveryUserId,
      status: "pending",
      expiresAt: onboardingRecoveryExpiry(),
      profileRetry: {
        experienceLevel: nextData.experience_level ?? "skip",
        intents: nextData.intent,
      },
      ...(goal ? { goal } : null),
      ...(settingsPatch ? { settingsPatch } : null),
      social: {
        ...unresolvedSocial,
        statuses: Object.fromEntries(
          unresolvedKeys.map((key) => [
            key,
            nextData.social_action_statuses[key] === "failed" ? "failed" : "pending",
          ]),
        ),
      },
      lifecycle,
    };
    await saveOnboardingRecovery(record);
    recoveryRef.current = record;
    return record;
  }

  function showRecoveryWriteError(error: unknown) {
    const payloadTooLarge = error instanceof OnboardingRecoveryPayloadTooLargeError;
    setStatusModal({
      title: "Recovery could not be saved",
      description: payloadTooLarge
        ? "This setup is too large to recover safely on this device. Remove some optional connections or setup choices, then tap Finish again."
        : "Setup recovery could not be updated on this device. No further setup actions were started. Free device storage or unlock secure storage, then retry.",
    });
  }

  function failedSocialKeysFor(nextData: OnboardingData): string[] {
    return Object.entries(nextData.social_action_statuses)
      .filter(([, status]) => status === "failed")
      .map(([key]) => key);
  }

  function hasUnresolvedSocial(record: PendingOnboardingRecoveryRecord): boolean {
    return (
      record.social.invitationIds.length > 0 ||
      record.social.groupIds.length > 0 ||
      record.social.followProfileIds.length > 0
    );
  }

  async function abandonFailedLifecycleAndFinish() {
    const record = recoveryRef.current;
    if (!record || record.status !== "pending") return;
    const lifecycle = {
      required: record.lifecycle.required,
      goal:
        record.lifecycle.goal.status === "failed"
          ? { status: "abandoned" as const, retryable: false }
          : record.lifecycle.goal,
      settings:
        record.lifecycle.settings.status === "failed"
          ? { status: "abandoned" as const, retryable: false }
          : record.lifecycle.settings,
    };
    try {
      const nextRecord = await persistRecovery(data, lifecycle);
      if (hasUnresolvedSocial(nextRecord)) {
        const failedKeys = failedSocialKeysFor(data);
        if (failedKeys.length > 0) showSocialRecoveryModal(failedKeys);
        return;
      }
      await finishLocalOnboarding();
    } catch (error) {
      console.error(error);
      showRecoveryWriteError(error);
    }
  }

  function showLifecycleRecoveryModal(lifecycle: PendingOnboardingRecoveryRecord["lifecycle"]) {
    const failedSections = [
      lifecycle.goal.status === "failed"
        ? { label: "goal", retryable: lifecycle.goal.retryable }
        : null,
      lifecycle.settings.status === "failed"
        ? { label: "training preferences", retryable: lifecycle.settings.retryable }
        : null,
    ].filter((section): section is { label: string; retryable: boolean } => section !== null);
    const failedItems = failedSections.map(({ label }) => label).join(" and ");
    const retryableItems = failedSections
      .filter(({ retryable }) => retryable)
      .map(({ label }) => label);
    const nonRetryableItems = failedSections
      .filter(({ retryable }) => !retryable)
      .map(({ label }) => label);
    const recoveryCopy = [
      retryableItems.length > 0
        ? `Dismiss this message and tap Finish to retry ${retryableItems.join(" and ")}.`
        : null,
      nonRetryableItems.length > 0
        ? `Select Continue and manage ${nonRetryableItems.join(" and ")} later.`
        : "Or select Continue and update it later.",
    ]
      .filter((message): message is string => message !== null)
      .join(" ");
    setStatusModal({
      title: "Setup saved",
      description: `Your profile is ready, but your ${failedItems} could not be saved. ${recoveryCopy}`,
      primaryLabel: "Continue",
      onPrimary: abandonFailedLifecycleAndFinish,
    });
  }

  async function abandonFailedSocialAndContinue(failedKeys: string[]) {
    const record = recoveryRef.current;
    if (!record || record.status !== "pending") return;
    const nextData = {
      ...data,
      social_action_statuses: Object.fromEntries(
        Object.entries(data.social_action_statuses).map(([key, actionStatus]) => [
          key,
          failedKeys.includes(key) ? "abandoned" : actionStatus,
        ]),
      ),
    } as OnboardingData;
    for (const key of failedKeys) excludedSocialActionKeysRef.current.add(key);
    setData(nextData);
    try {
      const nextRecord = await persistRecovery(nextData);
      if (
        nextRecord.lifecycle.goal.status === "failed" ||
        nextRecord.lifecycle.settings.status === "failed"
      ) {
        showLifecycleRecoveryModal(nextRecord.lifecycle);
        return;
      }
      await finishLocalOnboarding();
    } catch (error) {
      console.error(error);
      showRecoveryWriteError(error);
    }
  }

  function showSocialRecoveryModal(failedKeys: string[]) {
    setStatusModal({
      title: "Some connections failed",
      description: `${failedKeys.length} social action${failedKeys.length === 1 ? "" : "s"} could not be saved. Dismiss to retry only those actions, or continue without them.`,
      primaryLabel: "Continue",
      onPrimary: async () => abandonFailedSocialAndContinue(failedKeys),
    });
  }

  const finishLocalOnboarding = useCallback(async () => {
    if (localCompletionStartedRef.current) {
      return;
    }

    localCompletionStartedRef.current = true;
    try {
      await completeOnboarding();
      if (!recoveryRef.current || !recoveryUserId) {
        throw new Error("Onboarding recovery record not found");
      }
      const completedRecord = createCompletedOnboardingRecovery(recoveryUserId);
      await saveOnboardingRecovery(completedRecord);
      recoveryRef.current = completedRecord;
      try {
        await clearOnboardingRecovery(recoveryUserId);
        recoveryRef.current = null;
      } catch {
        // The completed marker keeps the gate from redirecting if cleanup must retry later.
      }
    } catch (error) {
      localCompletionStartedRef.current = false;
      throw error;
    }
  }, [completeOnboarding, recoveryUserId]);

  async function completeLifecycleSetup(
    recoveryData: OnboardingData,
  ): Promise<PendingOnboardingRecoveryRecord["lifecycle"] | null> {
    if (!profile?.id) {
      setStatusModal({ title: "Error", description: "User profile not found." });
      return null;
    }
    const recoveredRecord =
      recoveryRef.current?.status === "pending" ? recoveryRef.current : undefined;
    const previousLifecycle =
      recoveredRecord?.lifecycle ?? initialLifecycleFor(recoveryData, recoveredRecord?.goal);
    const lifecycleNeedsRetry =
      sectionNeedsRetry(previousLifecycle.required) ||
      sectionNeedsRetry(previousLifecycle.goal) ||
      sectionNeedsRetry(previousLifecycle.settings);
    if (!lifecycleNeedsRetry) return previousLifecycle;

    const profileData = restoredRecoveryRef.current
      ? {
          ...INITIAL_ONBOARDING_DATA,
          full_name: profile.full_name ?? "",
          username: profile.username ?? "",
          experience_level: recoveredRecord?.profileRetry.experienceLevel ?? "skip",
          intent: recoveredRecord?.profileRetry.intents ?? [],
        }
      : data;
    const result = buildCompleteOnboardingInput(
      profileData,
      restoredRecoveryRef.current ? {} : fieldSources,
    );

    if (!result.ok) {
      setStatusModal({ title: "Error", description: result.error });
      return null;
    }

    const goalNeedsRetry = sectionNeedsRetry(
      recoveredRecord?.lifecycle.goal ?? { status: "pending", retryable: true },
    );
    const goal = goalNeedsRetry ? recoveredRecord?.goal : undefined;
    const settingsNeedsRetry = sectionNeedsRetry(
      recoveredRecord?.lifecycle.settings ?? { status: "pending", retryable: true },
    );
    const settingsPatch = settingsNeedsRetry ? recoveredRecord?.settingsPatch : undefined;

    if (!goal) {
      setStatusModal({
        title: "Goal required",
        description: "Add a complete initial goal before finalizing setup.",
      });
      return null;
    }

    try {
      await completeLifecycleSetupMutation.mutateAsync({
        profile: result.input,
        goal,
        ...(settingsPatch ? { settings_patch: settingsPatch } : null),
      });
    } catch (error) {
      console.error(error);
      setStatusModal({
        title: "Setup could not be completed",
        description:
          "Required setup could not be confirmed. No connection actions were started. Retry now, or dismiss and tap Finish to try again.",
        primaryLabel: "Retry",
        onPrimary: async () => {
          await resumeCompletion(recoveryData);
        },
      });
      return null;
    }

    const nextLifecycle: PendingOnboardingRecoveryRecord["lifecycle"] = {
      required: { status: "saved", retryable: false },
      goal: { status: "saved", retryable: false },
      settings: settingsPatch ? { status: "saved", retryable: false } : previousLifecycle.settings,
    };
    try {
      await persistRecovery(recoveryData, nextLifecycle);
    } catch (error) {
      console.error(error);
      showRecoveryWriteError(error);
      return null;
    }

    await Promise.allSettled([
      utils.profiles.get.invalidate(),
      utils.profileSettings.getForProfile.invalidate(),
      utils.goals.list.invalidate(),
    ]);

    return nextLifecycle;
  }

  async function completeSocialActions(
    recoveryData: OnboardingData,
  ): Promise<OnboardingData | null> {
    const inviteJobs: SocialActionJob[] = recoveryData.selected_invitation_ids
      .map((invitationId) => ({
        key: `invite:${invitationId}`,
        run: () => acceptInviteMutation.mutateAsync({ invitationId }),
      }))
      .filter(
        (job) =>
          !excludedSocialActionKeysRef.current.has(job.key) &&
          !["saved", "abandoned"].includes(
            recoveryData.social_action_statuses[job.key] ?? "pending",
          ),
      );
    const groupJobs: SocialActionJob[] = recoveryData.selected_group_ids
      .map((groupId) => ({
        key: `group:${groupId}`,
        run: () => joinOrRequestGroupMutation.mutateAsync({ groupId }),
      }))
      .filter(
        (job) =>
          !excludedSocialActionKeysRef.current.has(job.key) &&
          !["saved", "abandoned"].includes(
            recoveryData.social_action_statuses[job.key] ?? "pending",
          ),
      );
    const followJobs: SocialActionJob[] = recoveryData.selected_follow_profile_ids
      .map((profileId) => ({
        key: `follow:${profileId}`,
        run: () => followProfileMutation.mutateAsync({ target_user_id: profileId }),
      }))
      .filter(
        (job) =>
          !excludedSocialActionKeysRef.current.has(job.key) &&
          !["saved", "abandoned"].includes(
            recoveryData.social_action_statuses[job.key] ?? "pending",
          ),
      );
    const pendingJobs = [...inviteJobs, ...groupJobs, ...followJobs];
    if (pendingJobs.length === 0) return recoveryData;

    const results = await runSocialActionsWithLimit(pendingJobs);
    const nextStatuses = { ...recoveryData.social_action_statuses };
    for (const result of results) {
      nextStatuses[result.key] = result.status;
      if (result.status === "saved") excludedSocialActionKeysRef.current.add(result.key);
    }
    const nextData = { ...recoveryData, social_action_statuses: nextStatuses };
    setData(nextData);
    try {
      await persistRecovery(nextData);
    } catch (error) {
      console.error(error);
      showRecoveryWriteError(error);
      return null;
    }
    await invalidateOnboardingSocialQueries(utils);
    return nextData;
  }

  async function resumeCompletion(recoveryData: OnboardingData): Promise<void> {
    const lifecycle = await completeLifecycleSetup(recoveryData);
    if (!lifecycle) return;

    const nextData = await completeSocialActions(recoveryData);
    if (!nextData) return;

    const failedSocialKeys = failedSocialKeysFor(nextData);
    if (failedSocialKeys.length > 0) {
      showSocialRecoveryModal(failedSocialKeys);
      return;
    }
    if (lifecycle.goal.status === "failed" || lifecycle.settings.status === "failed") {
      showLifecycleRecoveryModal(lifecycle);
      return;
    }
    await finishLocalOnboarding();
  }

  const handleComplete = async () => {
    if (completionInFlightRef.current) return;
    completionInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const profileInput = buildCompleteOnboardingInput(data, fieldSources);
      if (!profileInput.ok) {
        setStatusModal({ title: "Review setup", description: profileInput.error });
        return;
      }
      if (lifecycleStatus !== "review") return;
      const recoveryData = data;
      await persistRecovery(recoveryData);
      await resumeCompletion(recoveryData);
    } catch (error) {
      console.error(error);
      showRecoveryWriteError(error);
    } finally {
      completionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    data,
    fieldSources,
    handleComplete,
    isBusy,
    integrationOverview: syncOverviewQuery.data,
    lifecycleStatus,
    progress: progressQuery.data,
    progressError: progressQuery.error,
    refreshProgress: progressQuery.refetch,
    retryProviderProcessing,
    providersMutable: lifecycleStatus === "provider_selection",
    integrationOverviewError: syncOverviewQuery.error,
    integrationOverviewLoading: syncOverviewQuery.isLoading,
    refreshIntegrationState,
    setStatusModal,
    statusModal,
    startProviderProcessing,
    cancelPendingProviderConnection,
    restartProviderSelection,
    updateData,
    usernameAvailability: {
      available:
        usernameIsReadyToCheck &&
        !usernameAvailabilityQuery.isError &&
        !usernameAvailabilityQuery.isFetching
          ? usernameAvailabilityQuery.data?.available
          : undefined,
      isChecking:
        isValidOnboardingUsername(username) &&
        (!usernameIsReadyToCheck || usernameAvailabilityQuery.isFetching),
      isError: usernameIsReadyToCheck && usernameAvailabilityQuery.isError,
    },
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
