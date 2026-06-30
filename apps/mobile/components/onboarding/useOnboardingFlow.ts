import { estimateConservativeFTPFromWeight, estimateMaxHRFromDOB } from "@repo/core";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { useAuth } from "@/lib/hooks/useAuth";
import { buildCompleteOnboardingInput } from "@/lib/onboarding/complete-onboarding-input";
import { isValidOnboardingUsername } from "@/lib/onboarding/validation";
import { INITIAL_ONBOARDING_DATA } from "./onboarding-data";
import { getOnboardingSteps } from "./onboarding-steps";
import type {
  IntegrationProvider,
  OnboardingData,
  OnboardingFieldSources,
  ProviderSyncStatus,
  StepProps,
} from "./types";

export function useOnboardingFlow() {
  const [data, setData] = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerSyncStarted, setProviderSyncStarted] = useState(false);
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [touchedFields, setTouchedFields] = useState<Set<keyof OnboardingData>>(() => new Set());
  const [clearedFields, setClearedFields] = useState<Set<keyof OnboardingData>>(() => new Set());
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );
  const { completeOnboarding, isAuthenticated, isFullyLoaded } = useAuth();
  const profileQueryEnabled = isFullyLoaded && isAuthenticated && hasSessionAuthCredentials();
  const { data: profile } = api.profiles.get.useQuery(undefined, {
    enabled: profileQueryEnabled,
  });
  const username = data.username.trim();
  const utils = api.useUtils();
  const { data: integrations = [], refetch: refetchIntegrations } = api.integrations.list.useQuery(
    undefined,
    { enabled: profileQueryEnabled },
  );
  const importedValuesQuery = api.onboarding.getImportedOnboardingValues.useQuery(undefined, {
    enabled: profileQueryEnabled,
  });
  const statusQuery = api.onboarding.getProviderEnrichmentStatus.useQuery(undefined, {
    enabled: profileQueryEnabled && providerSyncStarted,
    refetchInterval: 1000,
  });
  const startProviderEnrichmentMutation = api.onboarding.startProviderEnrichment.useMutation({
    onSuccess: async () => {
      await utils.onboarding.getProviderEnrichmentStatus.invalidate();
      await utils.onboarding.getImportedOnboardingValues.invalidate();
    },
  });
  const clearProviderRequirementMutation = api.onboarding.clearProviderRequirement.useMutation({
    onSuccess: async () => {
      await utils.onboarding.getProviderEnrichmentStatus.invalidate();
      await utils.onboarding.getImportedOnboardingValues.invalidate();
    },
  });
  const completeOnboardingMutation = api.onboarding.completeOnboarding.useMutation();

  const updateData = useCallback(
    (
      updates: Partial<OnboardingData>,
      options?: { source?: "estimated" | "imported" | "user" },
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
    void refetchIntegrations();
  }, [refetchIntegrations]);

  useEffect(() => {
    const importedValues = importedValuesQuery.data;
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

    if (
      !touchedFields.has("ftp") &&
      !clearedFields.has("ftp") &&
      importedValues.values.ftp !== undefined
    ) {
      updates.ftp = importedValues.values.ftp;
    }

    if (Object.keys(updates).length > 0) {
      updateData(updates, { source: "imported" });
    }
  }, [clearedFields, importedValuesQuery.data, touchedFields, updateData]);

  useEffect(() => {
    const updates: Partial<OnboardingData> = {};

    const estimatedMaxHr = estimateMaxHRFromDOB(data.dob);
    if (
      estimatedMaxHr &&
      !touchedFields.has("max_hr") &&
      !clearedFields.has("max_hr") &&
      data.max_hr !== estimatedMaxHr
    ) {
      updates.max_hr = estimatedMaxHr;
    }

    const hasImportedFtp = importedValuesQuery.data?.values.ftp !== undefined;
    const estimatedFtp = estimateConservativeFTPFromWeight(data.weight_kg);
    if (
      estimatedFtp &&
      !hasImportedFtp &&
      data.sport_interests.includes("cycling") &&
      !touchedFields.has("ftp") &&
      !clearedFields.has("ftp") &&
      data.ftp !== estimatedFtp
    ) {
      updates.ftp = estimatedFtp;
    }

    if (Object.keys(updates).length > 0) {
      updateData(updates, { source: "estimated" });
    }
  }, [
    clearedFields,
    data.dob,
    data.ftp,
    data.max_hr,
    data.sport_interests,
    data.weight_kg,
    importedValuesQuery.data?.values.ftp,
    touchedFields,
    updateData,
  ]);

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

  const fieldSources = useMemo(() => {
    const sources: OnboardingFieldSources = {};
    const importedSources = importedValuesQuery.data?.sources;

    for (const field of ["dob", "gender", "weight_kg", "ftp"] as const) {
      if (importedSources?.[field]) {
        sources[field] = importedSources[field].label;
      }
    }

    if (!sources.max_hr && data.max_hr && estimateMaxHRFromDOB(data.dob) === data.max_hr) {
      sources.max_hr = "Estimated from date of birth";
    }

    if (
      !sources.ftp &&
      data.ftp &&
      estimateConservativeFTPFromWeight(data.weight_kg) === data.ftp
    ) {
      sources.ftp = "Estimated from weight";
    }

    return sources;
  }, [data.dob, data.ftp, data.max_hr, data.weight_kg, importedValuesQuery.data?.sources]);

  const retryProviderSync = async () => {
    const result = await refetchIntegrations();
    const providers = (result.data ?? integrations).map((integration) => integration.provider);
    if (providers.length === 0) return;
    setProviderSyncStarted(true);
    await startProviderEnrichmentMutation.mutateAsync({ providers });
    await statusQuery.refetch();
    await importedValuesQuery.refetch();
  };

  const clearProviderRequirement = async (provider: IntegrationProvider) => {
    setProviderSyncStarted(true);
    await clearProviderRequirementMutation.mutateAsync({ provider });
    await statusQuery.refetch();
  };

  const steps = useMemo(
    () =>
      getOnboardingSteps({
        providerSyncStarted,
        canContinueProviderSync: !providerSyncStarted || (statusQuery.data?.canContinue ?? false),
        isUsernameAvailable: isValidOnboardingUsername(username) && debouncedUsername === username,
      }),
    [debouncedUsername, providerSyncStarted, statusQuery.data?.canContinue, username],
  );
  const activeSteps = useMemo(() => steps.filter((step) => step.shouldShow(data)), [data, steps]);
  const currentStep = activeSteps[currentStepIndex];
  const isLastStep = currentStepIndex === activeSteps.length - 1;
  const isStepValid = currentStep?.isValid(data) ?? true;
  const canSkipStep = !isLastStep && (currentStep?.canSkip ?? false);
  const isProviderSyncBlocking =
    currentStep?.id === "connect_import" &&
    providerSyncStarted &&
    ["queued", "running"].includes(statusQuery.data?.status ?? "running");
  const isBusy =
    isSubmitting ||
    startProviderEnrichmentMutation.isPending ||
    clearProviderRequirementMutation.isPending;

  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!profile?.id) {
        setStatusModal({ title: "Error", description: "User profile not found." });
        return;
      }

      const result = buildCompleteOnboardingInput(data);

      if (!result.ok) {
        setStatusModal({ title: "Error", description: result.error });
        return;
      }

      await completeOnboardingMutation.mutateAsync(result.input);
      await completeOnboarding();
      router.replace("/");
    } catch (error) {
      setStatusModal({ title: "Error", description: "Failed to save profile. Please try again." });
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (isLastStep) {
      await handleComplete();
      return;
    }

    if (currentStep?.id === "connect_import") {
      const result = await refetchIntegrations();
      const providers = (result.data ?? integrations).map((integration) => integration.provider);

      if (!providerSyncStarted && providers.length > 0) {
        setProviderSyncStarted(true);
        try {
          await startProviderEnrichmentMutation.mutateAsync({ providers });
          await statusQuery.refetch();
          await importedValuesQuery.refetch();
        } catch (error) {
          console.error(error);
          setStatusModal({ title: "Error", description: "Failed to sync connected providers." });
        }
        return;
      }

      await importedValuesQuery.refetch();
    }

    setCurrentStepIndex((prev) => prev + 1);
  };

  const handleSkip = async () => {
    if (isLastStep) {
      await handleComplete();
      return;
    }
    if (currentStep?.id === "connect_import") {
      await handleNext();
      return;
    }
    setCurrentStepIndex((prev) => prev + 1);
  };

  return {
    activeSteps,
    canSkipStep,
    clearProviderRequirement,
    currentStep,
    currentStepIndex,
    data,
    fieldSources,
    handleNext,
    handleSkip,
    integrations: integrations as Array<{ provider: IntegrationProvider }>,
    isBusy,
    isLastStep,
    isProviderSyncBlocking,
    isStepValid,
    providerSyncStatus: statusQuery.data as ProviderSyncStatus | undefined,
    refreshIntegrationState,
    retryProviderSync,
    setStatusModal,
    statusModal,
    updateData,
    usernameAvailability: {
      available:
        debouncedUsername === username && isValidOnboardingUsername(username) ? true : undefined,
      isChecking: isValidOnboardingUsername(username) && debouncedUsername !== username,
    },
  };
}

export type OnboardingFlow = ReturnType<typeof useOnboardingFlow>;
