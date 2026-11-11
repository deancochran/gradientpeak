import type { ExecutableIntegrationProviderId, OnboardingStatus } from "@repo/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { getDeviceTimeZone } from "@/lib/calendar/eventSchedule";
import { useAuth } from "@/lib/hooks/useAuth";
import { buildCompleteOnboardingInput } from "@/lib/onboarding/complete-onboarding-input";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import { resolveOnboardingLifecycleStatus } from "./lifecycle-status";
import { INITIAL_ONBOARDING_DATA } from "./onboarding-data";
import {
  onboardingOverviewEnabled,
  onboardingProgressRefetchInterval,
} from "./processing-query-policy";
import { runOnboardingRecoveryAction } from "./recovery-actions";
import type { OnboardingData, OnboardingStatusModal } from "./types";

function isPendingOAuthError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "data" in error &&
      (error as { data?: { applicationErrorCode?: unknown } }).data?.applicationErrorCode ===
        "ONBOARDING_PENDING_OAUTH",
  );
}

export function useOnboardingFlow() {
  const [data, setData] = useState<OnboardingData>(() => ({
    ...INITIAL_ONBOARDING_DATA,
    planning_timezone: getDeviceTimeZone(),
  }));
  const activeUserIdRef = useRef<string | null>(null);
  const dirtyFieldsRef = useRef<Set<keyof OnboardingData>>(new Set());
  const submissionRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusModal, setStatusModal] = useState<OnboardingStatusModal | null>(null);
  const [lifecycleOverride, setLifecycleOverride] = useState<OnboardingStatus | null>(null);
  const {
    completeOnboarding,
    isAuthenticated,
    isFullyLoaded,
    onboardingStatus,
    refreshOnboardingStatus,
    user,
  } = useAuth();
  const activeUserId = isAuthenticated ? (user?.id ?? null) : null;

  // Effects run after paint. Update the ownership ref during render so a response
  // that settles between an account rerender and its effects is still rejected.
  if (activeUserIdRef.current !== activeUserId) {
    activeUserIdRef.current = activeUserId;
    submissionRef.current += 1;
    isSubmittingRef.current = false;
  }

  const profileQueryEnabled = isFullyLoaded && isAuthenticated && hasSessionAuthCredentials();
  const lifecycleStatus = resolveOnboardingLifecycleStatus({
    overrideStatus: lifecycleOverride,
    profileStatus: onboardingStatus,
  });
  const profileQuery = api.profiles.get.useQuery(undefined, { enabled: profileQueryEnabled });
  const username = data.username.trim();
  const usernameIsReadyToCheck =
    isValidOnboardingUsername(username) && debouncedUsername === username;
  const usernameAvailabilityQuery = api.onboarding.checkUsernameAvailability.useQuery(
    { username: debouncedUsername },
    { enabled: profileQueryEnabled && usernameIsReadyToCheck },
  );
  const syncOverviewQuery = api.integrations.getSyncOverview.useQuery(undefined, {
    enabled: onboardingOverviewEnabled({
      authenticated: profileQueryEnabled,
      status: lifecycleStatus,
    }),
  });
  const progressQuery = api.onboarding.getProgress.useQuery(undefined, {
    enabled: profileQueryEnabled && lifecycleStatus === "processing",
    refetchInterval: (query) => onboardingProgressRefetchInterval(query.state.data ?? {}),
  });
  const completeMutation = api.onboarding.completeLifecycleSetup.useMutation();
  const retryMutation = api.onboarding.retryProviderProcessing.useMutation();
  const restartMutation = api.onboarding.restartProviderSelection.useMutation();
  const cancelPendingOAuthMutation = api.integrations.cancelPendingOAuth.useMutation();
  const utils = api.useUtils();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedUsername(username), 400);
    return () => clearTimeout(timeout);
  }, [username]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Account changes intentionally reset the entire draft, even when reset values are identical.
  useEffect(() => {
    setData({ ...INITIAL_ONBOARDING_DATA, planning_timezone: getDeviceTimeZone() });
    setDebouncedUsername("");
    setIsSubmitting(false);
    setStatusModal(null);
    setLifecycleOverride(null);
    dirtyFieldsRef.current.clear();
  }, [activeUserId]);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || profile.id !== activeUserId) return;
    setData((current) => {
      const full_name = dirtyFieldsRef.current.has("full_name")
        ? current.full_name
        : current.full_name || profile.full_name || "";
      const username = dirtyFieldsRef.current.has("username")
        ? current.username
        : current.username || profile.username || "";
      const planning_timezone = dirtyFieldsRef.current.has("planning_timezone")
        ? current.planning_timezone
        : (profile.planning_timezone ?? current.planning_timezone ?? getDeviceTimeZone());

      // Query objects may be recreated by callers; avoid a no-op state update loop.
      if (
        full_name === current.full_name &&
        username === current.username &&
        planning_timezone === current.planning_timezone
      )
        return current;
      return { ...current, full_name, username, planning_timezone };
    });
  }, [activeUserId, profileQuery.data]);

  useEffect(() => {
    if (lifecycleOverride && onboardingStatus === lifecycleOverride) setLifecycleOverride(null);
  }, [lifecycleOverride, onboardingStatus]);

  useEffect(() => {
    const progressStatus = progressQuery.data?.status;
    if (progressStatus && progressStatus !== "processing") {
      setLifecycleOverride(progressStatus);
      void refreshOnboardingStatus();
    }
  }, [progressQuery.data?.status, refreshOnboardingStatus]);

  const updateData = useCallback(
    (updates: Partial<OnboardingData>) => {
      if (activeUserIdRef.current !== activeUserId) return;
      for (const field of Object.keys(updates) as Array<keyof OnboardingData>) {
        dirtyFieldsRef.current.add(field);
      }
      setData((current) => ({ ...current, ...updates }));
    },
    [activeUserId],
  );

  const refreshIntegrationState = useCallback(
    () => syncOverviewQuery.refetch(),
    [syncOverviewQuery.refetch],
  );

  const cancelPendingProviderConnection = async () => {
    for (const integration of syncOverviewQuery.data ?? []) {
      await cancelPendingOAuthMutation.mutateAsync({ provider: integration.provider });
    }
    await syncOverviewQuery.refetch();
  };

  const handleComplete = async () => {
    if (
      activeUserIdRef.current !== activeUserId ||
      profileQuery.isLoading ||
      isSubmittingRef.current ||
      (lifecycleStatus !== "provider_selection" && lifecycleStatus !== "review")
    ) {
      return;
    }
    if (profileQuery.isError) {
      setStatusModal({
        title: "Profile could not be loaded",
        description:
          "Retry loading your profile before finishing setup so your saved preferences are preserved.",
        primaryLabel: "Retry",
        onPrimary: async () => {
          await profileQuery.refetch();
        },
      });
      return;
    }
    const result = buildCompleteOnboardingInput(data);
    if (!result.ok) {
      setStatusModal({ title: "Review your profile", description: result.error });
      return;
    }
    if (usernameAvailabilityQuery.data?.available === false) {
      setStatusModal({
        title: "Username unavailable",
        description: "Choose another username before finishing setup.",
      });
      return;
    }
    const submittingUserId = activeUserId;
    if (!submittingUserId) return;
    const submission = ++submissionRef.current;
    const isCurrentSubmission = () =>
      submissionRef.current === submission && activeUserIdRef.current === submittingUserId;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await completeMutation.mutateAsync({ profile: result.input });
      // A late response belongs only to the account that initiated it. It must
      // never navigate or refresh state for a newly authenticated account.
      if (!isCurrentSubmission()) return;
      setLifecycleOverride("completed");
      await Promise.allSettled([utils.profiles.get.invalidate(), refreshOnboardingStatus()]);
      if (!isCurrentSubmission()) return;
      await completeOnboarding();
    } catch (error) {
      if (!isCurrentSubmission()) return;
      if (isPendingOAuthError(error)) {
        setStatusModal({
          title: "Connection still pending",
          description:
            "Finish the provider connection, or cancel it before continuing. Your profile was not finalized.",
          primaryLabel: "Cancel pending connection",
          onPrimary: cancelPendingProviderConnection,
          secondaryLabel: "Keep connection",
        });
      } else {
        setStatusModal({
          title: "Setup could not be completed",
          description: "Your profile was not finalized. Check your connection and try again.",
        });
      }
    } finally {
      if (isCurrentSubmission()) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const retryProviderProcessing = async (provider: ExecutableIntegrationProviderId) => {
    await runOnboardingRecoveryAction({
      action: async () => {
        await retryMutation.mutateAsync({ provider });
        await progressQuery.refetch();
      },
      setStatusModal,
      failure: {
        title: "Preparation could not be retried",
        description: "Try again or return to account selection.",
      },
    });
  };

  const restartProviderSelection = async () => {
    await runOnboardingRecoveryAction({
      action: async () => {
        const result = await restartMutation.mutateAsync();
        setLifecycleOverride(result.status);
        await Promise.allSettled([refreshOnboardingStatus(), syncOverviewQuery.refetch()]);
      },
      setStatusModal,
      failure: {
        title: "Account selection could not be reopened",
        description: "Try again in a moment.",
      },
    });
  };

  const isBusy =
    profileQuery.isLoading ||
    isSubmitting ||
    retryMutation.isPending ||
    restartMutation.isPending ||
    cancelPendingOAuthMutation.isPending;

  return {
    accountIdentity: activeUserId,
    data,
    fieldSources: {},
    handleComplete,
    isBusy,
    integrationOverview: syncOverviewQuery.data,
    integrationOverviewError: syncOverviewQuery.error,
    integrationOverviewLoading: syncOverviewQuery.isLoading,
    lifecycleStatus,
    progress: progressQuery.data,
    progressError: progressQuery.error,
    refreshIntegrationState,
    refreshProgress: progressQuery.refetch,
    restartProviderSelection,
    retryProviderProcessing,
    setStatusModal,
    statusModal,
    updateData,
    usernameAvailability: {
      ...(usernameIsReadyToCheck &&
      !usernameAvailabilityQuery.isError &&
      !usernameAvailabilityQuery.isFetching &&
      usernameAvailabilityQuery.data?.available !== undefined
        ? { available: usernameAvailabilityQuery.data.available }
        : {}),
      isChecking:
        isValidOnboardingUsername(username) &&
        (!usernameIsReadyToCheck || usernameAvailabilityQuery.isFetching),
      isError: usernameIsReadyToCheck && usernameAvailabilityQuery.isError,
    },
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
