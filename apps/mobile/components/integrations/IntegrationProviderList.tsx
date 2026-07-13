import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { AlertCircle, Check, Link, RefreshCcw, Unlink } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { IntegrationProvider } from "@/lib/constants/integrations";

type IntegrationOutputs = inferRouterOutputs<AppRouter>["integrations"];

export type IntegrationOverviewItem = IntegrationOutputs["getSyncOverview"][number];

type IntegrationProviderListProps = {
  integrations: IntegrationOverviewItem[];
  error?: unknown;
  isLoading?: boolean;
  onConnect: (provider: IntegrationProvider) => void;
  onDisconnect?: (integration: IntegrationOverviewItem) => void;
  pendingByProvider?: Partial<Record<IntegrationProvider, "connect" | "disconnect">>;
  onRetry?: () => unknown;
};

function getStatusTone(health: IntegrationOverviewItem["summary"]["health"]) {
  switch (health) {
    case "connected":
      return { container: "border-green-500/30 bg-green-500/10", text: "text-green-700" };
    case "queued":
    case "syncing":
      return { container: "border-blue-500/30 bg-blue-500/10", text: "text-blue-700" };
    case "failed":
    case "needs_reconnect":
      return { container: "border-destructive/30 bg-destructive/10", text: "text-destructive" };
    case "unavailable":
      return { container: "border-border bg-muted/30", text: "text-muted-foreground" };
  }
}

function getProviderError(overview: IntegrationOverviewItem) {
  return (
    overview.providerHealth.lastError ??
    overview.activityHistory.lastError ??
    overview.setupData.lastError ??
    overview.plannedWorkouts.lastError ??
    null
  );
}

export function IntegrationProviderList({
  integrations,
  error,
  isLoading = false,
  onConnect,
  onDisconnect,
  pendingByProvider = {},
  onRetry,
}: IntegrationProviderListProps) {
  const visibleIntegrations = integrations.filter((integration) => integration.configured);
  const readyCount = visibleIntegrations.filter(
    (integration) => integration.providerHealth.status === "connected",
  ).length;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted-foreground">
          {isLoading
            ? "Checking…"
            : error
              ? "Availability unavailable"
              : `${readyCount}/${visibleIntegrations.length} ready`}
        </Text>
        {isLoading ? <ActivityIndicator size="small" /> : null}
      </View>

      {error ? (
        <View
          className="gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
          testID="integration-provider-list-error"
        >
          <View className="flex-row items-start gap-2">
            <Icon as={AlertCircle} size={16} className="mt-0.5 text-destructive" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-destructive">
                Couldn’t load integration availability
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                Retry to check which providers are configured.
              </Text>
            </View>
          </View>
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              className="self-start rounded-full border border-destructive/30 bg-background px-3 py-2"
              onPress={() => {
                void onRetry();
              }}
              testID="integration-provider-list-retry"
            >
              <Text className="text-sm font-semibold text-destructive">Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="gap-2">
        {visibleIntegrations.map((integration) => {
          const pendingAction = pendingByProvider[integration.provider];
          const isPending = pendingAction !== undefined;
          const error = getProviderError(integration);
          const statusTone = getStatusTone(integration.summary.health);

          return (
            <View
              key={integration.provider}
              accessibilityState={{ busy: isPending }}
              testID={`integration-provider-${integration.provider}`}
              className={`rounded-2xl border border-border bg-card px-4 py-3 ${isPending ? "opacity-70" : ""}`}
            >
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-semibold text-foreground">
                      {integration.summary.title}
                    </Text>
                    <View className={`rounded-full border px-2 py-0.5 ${statusTone.container}`}>
                      <Text className={`text-[11px] font-semibold ${statusTone.text}`}>
                        {integration.summary.badge}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {integration.summary.subtitle}
                  </Text>
                </View>

                {isPending ? (
                  <ActivityIndicator
                    accessibilityLabel={`${integration.label} action in progress`}
                    size="small"
                  />
                ) : integration.primaryAction === "connect" ? (
                  <Pressable
                    onPress={() => onConnect(integration.provider)}
                    accessibilityLabel={`Connect ${integration.label}`}
                    testID={`integration-connect-${integration.provider}`}
                    className="rounded-full border border-border bg-background p-2"
                  >
                    <Icon as={Link} size={18} className="text-foreground" />
                  </Pressable>
                ) : integration.primaryAction === "reconnect" ? (
                  <Pressable
                    onPress={() => onConnect(integration.provider)}
                    accessibilityLabel={`Reconnect ${integration.label}`}
                    testID={`integration-reconnect-${integration.provider}`}
                    className="rounded-full border border-destructive/30 bg-background p-2"
                  >
                    <Icon as={RefreshCcw} size={18} className="text-destructive" />
                  </Pressable>
                ) : integration.primaryAction === "disconnect" && onDisconnect ? (
                  <Pressable
                    onPress={() => onDisconnect(integration)}
                    accessibilityLabel={`Disconnect ${integration.label}`}
                    testID={`integration-disconnect-${integration.provider}`}
                    className="rounded-full border border-border bg-background p-2"
                  >
                    <Icon as={Unlink} size={18} className="text-muted-foreground" />
                  </Pressable>
                ) : integration.connected ? (
                  <Icon as={Check} className="text-green-600" size={20} />
                ) : null}
              </View>

              {error ? (
                <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2">
                  <Icon as={AlertCircle} size={14} className="mt-0.5 text-destructive" />
                  <Text className="flex-1 text-xs text-destructive" numberOfLines={2}>
                    {error}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {!isLoading && !error && visibleIntegrations.length === 0 ? (
        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-sm font-semibold text-foreground">No integrations</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Server credentials are not configured.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
