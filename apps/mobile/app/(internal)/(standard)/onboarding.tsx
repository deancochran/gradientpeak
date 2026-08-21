import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useRef } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProviderProcessingStep } from "@/components/onboarding/ProviderProcessingStep";
import { ProviderSelectionStep } from "@/components/onboarding/ProviderSelectionStep";
import { IdentityStep } from "@/components/onboarding/steps";
import type { StepProps } from "@/components/onboarding/types";
import { useOnboardingFlow } from "@/components/onboarding/useOnboardingFlow";
import { useProviderConnection } from "@/components/onboarding/useProviderConnection";
import { AppConfirmModal } from "@/components/shared/AppFormModal";

export default function OnboardingScreen() {
  const flow = useOnboardingFlow();
  const providerConnection = useProviderConnection({
    onConnected: flow.refreshIntegrationState,
    setStatusModal: flow.setStatusModal,
  });
  const statusActionPendingRef = useRef(false);
  if (flow.lifecycleStatus === "completed") return null;

  const shared: StepProps = {
    data: flow.data,
    fieldSources: flow.fieldSources,
    ...(flow.integrationOverview !== undefined
      ? { integrationOverview: flow.integrationOverview }
      : {}),
    integrationOverviewError: flow.integrationOverviewError,
    integrationOverviewLoading: flow.integrationOverviewLoading,
    onboardingStatus: flow.lifecycleStatus,
    onRefreshIntegrations: flow.refreshIntegrationState,
    providersMutable: flow.lifecycleStatus === "provider_selection",
    updateData: flow.updateData,
    usernameAvailability: flow.usernameAvailability,
  };

  const handleModalPrimary = async () => {
    if (statusActionPendingRef.current) return;
    const modal = flow.statusModal;
    if (!modal?.onPrimary) return flow.setStatusModal(null);
    statusActionPendingRef.current = true;
    flow.setStatusModal(null);
    try {
      await modal.onPrimary();
    } finally {
      statusActionPendingRef.current = false;
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <View className="flex-1 bg-background" testID="onboarding-screen">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {flow.lifecycleStatus === "provider_selection" || flow.lifecycleStatus === "review" ? (
            <View className="gap-10" testID="onboarding-identity">
              <View className="gap-2">
                <Text className="text-2xl font-bold">Finish your profile</Text>
                <Text className="text-muted-foreground">
                  Add your name and username. Everything else can be set up later.
                </Text>
              </View>
              <IdentityStep {...shared} />
              {flow.lifecycleStatus === "provider_selection" ? (
                <View className="gap-3" testID="onboarding-provider-selection">
                  <Text className="text-lg font-semibold">Optional training account</Text>
                  <Text className="text-muted-foreground">
                    Connect an account now, or continue without one and manage integrations later.
                  </Text>
                  <ProviderSelectionStep
                    integrations={flow.integrationOverview ?? []}
                    {...(flow.integrationOverviewError
                      ? { error: flow.integrationOverviewError }
                      : {})}
                    isLoading={flow.integrationOverviewLoading}
                    onConnect={(provider) => void providerConnection.connect(provider)}
                    onRetry={flow.refreshIntegrationState}
                    pendingProvider={providerConnection.pendingProvider}
                  />
                </View>
              ) : null}
            </View>
          ) : flow.lifecycleStatus === "processing" ? (
            <View className="gap-6" testID="onboarding-processing">
              {flow.progress ? (
                <ProviderProcessingStep
                  isBusy={flow.isBusy}
                  onRecovery={(recovery) =>
                    recovery.action === "retry"
                      ? void flow.retryProviderProcessing(recovery.provider)
                      : void flow.restartProviderSelection()
                  }
                  progress={flow.progress}
                />
              ) : null}
              {flow.progressError ? (
                <View className="gap-3" accessibilityRole="alert">
                  <Text>
                    Preparation progress could not be refreshed. Your work is still saved.
                  </Text>
                  <Button onPress={() => void flow.refreshProgress()} variant="outline">
                    <Text>Retry progress</Text>
                  </Button>
                </View>
              ) : null}
              {!flow.progress && !flow.progressError ? (
                <View accessibilityLiveRegion="polite" className="gap-2">
                  <Text className="text-lg font-semibold">Loading preparation progress</Text>
                  <Text className="text-muted-foreground">
                    Checking the latest saved preparation milestone.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        {flow.lifecycleStatus === "provider_selection" || flow.lifecycleStatus === "review" ? (
          <View className="gap-2 border-t border-border bg-background p-4">
            <Button
              disabled={flow.isBusy}
              onPress={() => void flow.handleComplete()}
              testID="onboarding-finish-button"
            >
              <Text className="font-semibold text-primary-foreground">Finish setup</Text>
            </Button>
            <Text className="text-center text-sm text-muted-foreground">
              Goals, preferences, metrics, groups, and people are available after setup.
            </Text>
          </View>
        ) : null}
        {flow.statusModal ? (
          <AppConfirmModal
            description={flow.statusModal.description}
            onClose={() => flow.setStatusModal(null)}
            primaryAction={{
              label: flow.statusModal.primaryLabel ?? "OK",
              onPress: () => void handleModalPrimary(),
              testID: "onboarding-status-confirm",
            }}
            {...(flow.statusModal.onPrimary || flow.statusModal.onSecondary
              ? {
                  secondaryAction: {
                    label: flow.statusModal.secondaryLabel ?? "Dismiss",
                    onPress: () => {
                      const modal = flow.statusModal;
                      flow.setStatusModal(null);
                      void modal?.onSecondary?.();
                    },
                    testID: "onboarding-status-dismiss",
                    variant: "outline",
                  },
                }
              : {})}
            testID="onboarding-status-modal"
            title={flow.statusModal.title}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
