import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { ProgressBar } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

type OnboardingProgress = inferRouterOutputs<AppRouter>["onboarding"]["getProgress"];

const providerStateCopy = {
  waiting: "Waiting",
  working: "Working",
  complete: "Complete",
  needs_attention: "Needs attention",
} as const;

export function ProviderProcessingStep({
  progress,
  isBusy,
  onRecovery,
}: {
  progress: OnboardingProgress;
  isBusy: boolean;
  onRecovery: (recovery: NonNullable<OnboardingProgress["recovery"]>) => void;
}) {
  const announcement = [progress.message, `${progress.percent}%`, progress.detail]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return (
    <View className="gap-5" testID="provider-processing-step">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-2xl font-bold">
          Preparing your starting point
        </Text>
        <Text accessibilityLiveRegion="polite" className="sr-only">
          {announcement}
        </Text>
      </View>
      <View className="gap-3">
        <Text className="font-medium">{progress.message}</Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <ProgressBar
              accessibilityLabel="Onboarding preparation progress"
              value={progress.percent}
            />
          </View>
          <Text className="min-w-12 text-right text-sm font-semibold">{progress.percent}%</Text>
        </View>
        {progress.detail ? (
          <Text className="text-sm text-muted-foreground">{progress.detail}</Text>
        ) : null}
      </View>
      {progress.provider_summary.length > 1 || progress.recovery ? (
        <View
          accessibilityLabel="Connected account preparation statuses"
          className="flex-row flex-wrap gap-2"
        >
          {progress.provider_summary.map((provider) => (
            <View className="rounded-full border border-border px-3 py-1" key={provider.provider}>
              <Text className="text-xs">
                {provider.label}: {providerStateCopy[provider.state]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {progress.recovery ? (
        <View
          accessibilityLiveRegion="assertive"
          accessibilityLabel={progress.recovery.message}
          accessibilityRole="alert"
          className="gap-3 rounded-2xl border border-destructive/40 p-4"
        >
          <Text>{progress.recovery.message}</Text>
          <Button
            disabled={isBusy}
            onPress={() => progress.recovery && onRecovery(progress.recovery)}
            testId={`onboarding-recovery-${progress.recovery.action}`}
            variant="outline"
          >
            <Text>
              {progress.recovery.action === "retry"
                ? `Retry ${progress.recovery.label}`
                : "Return to account selection"}
            </Text>
          </Button>
        </View>
      ) : null}
      <Text className="text-sm text-muted-foreground">
        It’s safe to leave and return while this work continues in the background.
      </Text>
    </View>
  );
}
