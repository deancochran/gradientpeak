import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Progress } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { ArrowRight } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOnboardingFlow } from "@/components/onboarding/useOnboardingFlow";
import { AppConfirmModal } from "@/components/shared/AppFormModal";

export default function OnboardingScreen() {
  const flow = useOnboardingFlow();
  const CurrentStep = flow.currentStep?.component;

  if (!flow.currentStep || !CurrentStep) return null;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <View className="flex-1 bg-background" testID="onboarding-screen">
        <View className="px-6 py-4 border-b border-border/50 flex-row items-center justify-between bg-background z-10">
          <Text className="text-sm font-medium text-muted-foreground">
            Step {flow.currentStepIndex + 1} of {flow.activeSteps.length}
          </Text>
          <Progress
            className="mx-4 h-1 flex-1"
            value={((flow.currentStepIndex + 1) / flow.activeSteps.length) * 100}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <CurrentStep
            connectionOverview={flow.connectionOverview}
            data={flow.data}
            fieldSources={flow.fieldSources}
            integrations={flow.integrations}
            onClearProviderRequirement={flow.clearProviderRequirement}
            onRefreshIntegrations={flow.refreshIntegrationState}
            onRetryProviderSync={flow.retryProviderSync}
            providerSyncStatus={flow.providerSyncStatus}
            updateData={flow.updateData}
            usernameAvailability={flow.usernameAvailability}
          />
        </ScrollView>

        <View className="px-6 py-4 border-t border-border/50 bg-background flex-row gap-4">
          <Button
            className={`flex-1 ${!flow.canSkipStep ? "opacity-50" : ""}`}
            disabled={flow.isBusy || !flow.canSkipStep || flow.isProviderSyncBlocking}
            onPress={flow.handleSkip}
            testID="onboarding-skip-button"
            variant="ghost"
          >
            <Text className="text-muted-foreground">Skip</Text>
          </Button>
          <Button
            className={`flex-[2] ${!flow.isStepValid ? "opacity-50" : ""}`}
            disabled={flow.isBusy || flow.isProviderSyncBlocking || !flow.isStepValid}
            onPress={flow.handleNext}
            testID={flow.isLastStep ? "onboarding-finish-button" : "onboarding-next-button"}
          >
            <Text className="font-semibold text-primary-foreground">
              {flow.isLastStep ? "Finish" : "Next"}
            </Text>
            {!flow.isLastStep && <Icon as={ArrowRight} className="ml-2 text-primary-foreground" />}
          </Button>
        </View>

        {flow.statusModal ? (
          <AppConfirmModal
            description={flow.statusModal.description}
            onClose={() => flow.setStatusModal(null)}
            primaryAction={{
              label: "OK",
              onPress: () => flow.setStatusModal(null),
              testID: "onboarding-status-confirm",
            }}
            testID="onboarding-status-modal"
            title={flow.statusModal.title}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
