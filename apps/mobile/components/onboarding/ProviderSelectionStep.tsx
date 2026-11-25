import type { ExecutableIntegrationProviderId } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { ActivityIndicator, View } from "react-native";
import type { OnboardingIntegrationOverview } from "./types";

type ProviderSelectionItem<TProvider extends string> = Pick<
  OnboardingIntegrationOverview<TProvider>,
  | "configured"
  | "connected"
  | "label"
  | "onboarding"
  | "primaryAction"
  | "provider"
  | "providerHealth"
>;

export function ProviderSelectionStep<TProvider extends string = ExecutableIntegrationProviderId>({
  integrations,
  error,
  isLoading = false,
  pendingProvider,
  onConnect,
  onRetry,
}: {
  integrations: ProviderSelectionItem<TProvider>[];
  error?: unknown;
  isLoading?: boolean;
  pendingProvider?: TProvider | null;
  onConnect: (provider: TProvider) => void;
  onRetry?: () => unknown;
}) {
  return (
    <View className="gap-5" testID="provider-selection-step">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-2xl font-bold">
          Connect your accounts
        </Text>
        <Text className="text-muted-foreground">
          Connect training accounts to import activity history and profile details, so GradientPeak
          can personalize your starting targets with fewer questions. Connecting is optional, and
          you control which accounts remain connected.
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator accessibilityLabel="Checking available training accounts" />
      ) : null}
      {error ? (
        <View className="gap-3 rounded-2xl border border-destructive/30 p-4">
          <Text className="text-destructive" accessibilityLiveRegion="polite">
            Available accounts could not be loaded. Try again.
          </Text>
          {onRetry ? (
            <Button onPress={() => void onRetry()} testId="onboarding-provider-list-retry">
              <Text className="font-semibold text-primary-foreground">Retry</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
      <View className="gap-3" accessibilityLabel="Available training accounts">
        {integrations.map((provider) => {
          const reconnect = provider.primaryAction === "reconnect";
          const pending = pendingProvider === provider.provider;
          const canConnect = provider.configured && (!provider.connected || reconnect);
          return (
            <View
              className="gap-3 rounded-2xl border border-border bg-card p-4"
              key={provider.provider}
              testID={`onboarding-provider-${provider.provider}`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold">{provider.label}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {provider.onboarding.summary}
                  </Text>
                </View>
                {provider.connected && !reconnect ? (
                  <Text
                    accessibilityLabel={`${provider.label} connected`}
                    className="font-semibold"
                  >
                    ✓ Connected
                  </Text>
                ) : null}
              </View>
              {!provider.configured ? (
                <Text className="text-sm text-muted-foreground">Unavailable on this server</Text>
              ) : null}
              {provider.providerHealth.status === "needs_reconnect" ? (
                <Text className="text-sm text-destructive" accessibilityLiveRegion="polite">
                  This account needs to be reconnected before it can sync.
                </Text>
              ) : null}
              {canConnect ? (
                <Button
                  accessibilityLabel={`${reconnect ? "Reconnect" : "Connect"} ${provider.label}`}
                  disabled={pending}
                  onPress={() => onConnect(provider.provider)}
                  testId={`onboarding-${reconnect ? "reconnect" : "connect"}-${provider.provider}`}
                  variant={reconnect ? "outline" : "default"}
                >
                  <Text
                    className={
                      reconnect ? "font-semibold" : "font-semibold text-primary-foreground"
                    }
                  >
                    {pending ? "Opening…" : reconnect ? "Reconnect" : "Connect"}
                  </Text>
                </Button>
              ) : provider.connected ? (
                <Button disabled variant="outline">
                  <Text>Connected</Text>
                </Button>
              ) : null}
            </View>
          );
        })}
      </View>
      {!isLoading && !error && integrations.length === 0 ? (
        <Text className="rounded-2xl border border-border p-4 text-muted-foreground">
          No training account providers are available right now. You can continue and add one later.
        </Text>
      ) : null}
    </View>
  );
}
