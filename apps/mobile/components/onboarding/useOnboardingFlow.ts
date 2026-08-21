import type { ExecutableIntegrationProviderId, OnboardingStatus } from "@repo/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
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
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
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
  } = useAuth();
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

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setData((current) => ({
      ...current,
      full_name: current.full_name || profile.full_name || "",
      username: current.username || profile.username || "",
    }));
  }, [profileQuery.data]);

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

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((current) => ({ ...current, ...updates }));
  }, []);

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
      isSubmitting ||
      (lifecycleStatus !== "provider_selection" && lifecycleStatus !== "review")
    ) {
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
    setIsSubmitting(true);
    try {
      await completeMutation.mutateAsync({ profile: result.input });
      setLifecycleOverride("completed");
      await Promise.allSettled([utils.profiles.get.invalidate(), refreshOnboardingStatus()]);
      await completeOnboarding();
    } catch (error) {
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
      setIsSubmitting(false);
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
    isSubmitting ||
    completeMutation.isPending ||
    retryMutation.isPending ||
    restartMutation.isPending ||
    cancelPendingOAuthMutation.isPending;

  return {
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
