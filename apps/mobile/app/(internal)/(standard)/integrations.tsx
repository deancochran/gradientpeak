import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import type { IntegrationProvider } from "@/lib/constants/integrations";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";

type IntegrationConfig = {
  provider: IntegrationProvider;
  name: string;
};

type IntegrationOverviewItem = {
  actions: Array<"refresh_setup_data" | "sync_now" | "disconnect">;
  activityHistory: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status: "idle" | "queued" | "importing" | "synced" | "failed" | "unsupported";
  };
  plannedWorkouts: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status: "automatic" | "queued" | "syncing" | "failed" | "unsupported";
  };
  providerHealth: {
    lastError: string | null;
    status: "connected" | "needs_reconnect" | "unsupported";
  };
  setupData: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    status: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
  };
  connected: boolean;
  integrationId: string | null;
  label: string;
  provider: IntegrationProvider;
};

const INTEGRATIONS: IntegrationConfig[] = [
  { provider: "strava", name: "Strava" },
  { provider: "wahoo", name: "Wahoo" },
  { provider: "trainingpeaks", name: "TrainingPeaks" },
  { provider: "garmin", name: "Garmin Connect" },
  { provider: "zwift", name: "Zwift" },
];

function getConnectedSummary(overview: IntegrationOverviewItem[] | undefined) {
  const count = overview?.filter((provider) => provider.connected).length ?? 0;
  if (count === 0) return "No services connected";
  return `${count} connected ${count === 1 ? "service" : "services"}`;
}

function getSetupDataCopy(status: IntegrationOverviewItem["setupData"]["status"]) {
  switch (status) {
    case "refreshing":
      return "Setup data: Refreshing from provider.";
    case "refreshed":
      return "Setup data: Refreshed safely.";
    case "failed":
      return "Setup data: Needs attention.";
    case "idle":
      return "Setup data: Ready to refresh missing values.";
    case "unsupported":
      return "Setup data: Not available.";
  }
}

function getProviderMetricSummary(fields: string[] | undefined) {
  const labels = (fields ?? []).map((field) => {
    switch (field) {
      case "weight_kg":
        return "weight";
      case "ftp":
        return "FTP";
      case "dob":
        return "date of birth";
      case "gender":
        return "gender";
      default:
        return field;
    }
  });

  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function getSyncCompleteDescription(result: {
  queued: boolean;
  setupRefresh?: {
    fieldsKept?: string[];
    fieldsUpdated?: string[];
    keptExistingValues?: boolean;
  } | null;
}) {
  const updatedSummary = getProviderMetricSummary(result.setupRefresh?.fieldsUpdated);
  const keptSummary = getProviderMetricSummary(result.setupRefresh?.fieldsKept);
  const historyCopy = result.queued
    ? "Recent history sync has been queued."
    : "Recent history sync was not queued; check the status above or try again shortly.";

  if (updatedSummary) {
    return keptSummary
      ? `Updated ${updatedSummary} from Wahoo. Kept your existing GradientPeak ${keptSummary} because Wahoo differs. ${historyCopy}`
      : `Updated ${updatedSummary} from Wahoo. ${historyCopy}`;
  }

  if (keptSummary) {
    return `Wahoo differs for ${keptSummary}; kept your existing GradientPeak values. ${historyCopy}`;
  }

  return `Wahoo sync ran. ${historyCopy}`;
}

function getPlannedWorkoutCopy(status: IntegrationOverviewItem["plannedWorkouts"]["status"]) {
  switch (status) {
    case "queued":
      return "Planned workouts: Sync queued.";
    case "syncing":
      return "Planned workouts: Syncing.";
    case "failed":
      return "Planned workouts: Needs attention.";
    case "automatic":
      return "Planned workouts: Automatic when connected.";
    case "unsupported":
      return "Planned workouts: Not available.";
  }
}

function getActivityHistoryCopy(status: IntegrationOverviewItem["activityHistory"]["status"]) {
  switch (status) {
    case "queued":
      return "Recent activity history is queued for import.";
    case "importing":
      return "Importing recent activity history.";
    case "synced":
      return "Recent activity history is up to date.";
    case "failed":
      return "Recent activity history needs attention. Try Sync now.";
    case "idle":
      return "Recent activity history will import automatically.";
    case "unsupported":
      return "Activity history import is not available for this provider.";
  }
}

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const [pendingByProvider, setPendingByProvider] = useState<
    Partial<Record<IntegrationProvider, "connect" | "disconnect" | "sync">>
  >({});
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationProvider | null>(
    null,
  );
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );

  const utils = api.useUtils();
  const {
    data: syncOverview,
    refetch: refetchSyncOverview,
    isLoading: integrationsLoading,
  } = api.integrations.getSyncOverview.useQuery();
  const getAuthUrlMutation = useReliableMutation(api.integrations.getAuthUrl, {
    silent: true,
  });
  const invalidateIntegrations = [
    () => utils.integrations.getSyncOverview.invalidate(),
    () => utils.integrations.list.invalidate(),
  ];
  const syncNowMutation = useReliableMutation(api.integrations.syncNow, {
    invalidate: invalidateIntegrations,
    success: "Sync queued",
  });
  const disconnectMutation = useReliableMutation(api.integrations.disconnect, {
    invalidate: invalidateIntegrations,
    success: "Integration disconnected",
  });

  const handleDeepLink = useCallback(
    (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        const success = url.searchParams.get("success");
        const error = url.searchParams.get("error");
        const provider = url.searchParams.get("provider");
        const errorDetail = url.searchParams.get("error_detail");

        if (success === "true") {
          setStatusModal({
            title: "Success",
            description: `Successfully connected to ${provider}. Recent history imports automatically when supported.`,
          });
          refetchSyncOverview();
        } else if (error) {
          refetchSyncOverview();
          let errorMessage = "Failed to connect";
          switch (error) {
            case "invalid_state":
              errorMessage = "Security validation failed. Please try again.";
              break;
            case "missing_code":
              errorMessage = "Authorization was not completed. Please try again.";
              break;
            case "database_error":
              errorMessage = "Failed to save integration. Please try again.";
              break;
            case "server_error":
              errorMessage = "An unexpected error occurred. Please try again.";
              break;
            case "token_exchange_failed":
              errorMessage = `OAuth token exchange failed. ${errorDetail ? `Provider said: ${errorDetail}` : "Check callback URL, app credentials, and redirect URI match."}`;
              break;
            case "store_integration_failed":
              errorMessage =
                "Connected with provider, but failed to save integration. Please try again.";
              break;
            case "invalid_provider":
              errorMessage = "Invalid provider. Please try again.";
              break;
            default:
              errorMessage = `Failed to connect: ${error}`;
          }
          setStatusModal({ title: "Error", description: errorMessage });
        }
      } catch (err) {
        console.error("Failed to parse deep link:", err);
      }
    },
    [refetchSyncOverview],
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", handleDeepLink);
    refetchSyncOverview();
    return () => subscription.remove();
  }, [handleDeepLink, refetchSyncOverview]);

  useEffect(() => {
    const backHandler = BackHandler?.addEventListener?.("hardwareBackPress", () => {
      handleClose();
      return true;
    });

    return () => backHandler?.remove?.();
  }, [handleClose]);

  const handleConnect = async (provider: IntegrationProvider) => {
    setPendingByProvider((prev) => ({ ...prev, [provider]: "connect" }));

    try {
      const redirectUri = getMobileRedirectUri();
      const { url } = await getAuthUrlMutation.mutateAsync({ provider, redirectUri });
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri, {
        preferEphemeralSession: Platform.OS === "ios",
      });

      if (result.type === "cancel") {
        setStatusModal({ title: "Cancelled", description: "OAuth flow was cancelled" });
      } else if (result.type === "success" && "url" in result && result.url) {
        handleDeepLink({ url: result.url });
      }
    } catch (error) {
      console.error("OAuth initiation error:", error);
      setStatusModal({
        title: "Error",
        description: "Failed to initiate connection. Please try again.",
      });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const handleDisconnect = async (provider: IntegrationProvider) => {
    setDisconnectingProvider(provider);
  };

  const confirmDisconnect = async () => {
    if (!disconnectingProvider) return;
    const provider = disconnectingProvider;
    setPendingByProvider((prev) => ({ ...prev, [provider]: "disconnect" }));
    try {
      await disconnectMutation.mutateAsync({ provider });
      refetchSyncOverview();
      setDisconnectingProvider(null);
      setStatusModal({ title: "Success", description: "Integration disconnected successfully" });
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusModal({ title: "Error", description: "Failed to disconnect. Please try again." });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const handleSyncNow = async (provider: IntegrationProvider) => {
    setPendingByProvider((prev) => ({ ...prev, [provider]: "sync" }));
    try {
      const result = await syncNowMutation.mutateAsync({ provider });
      await refetchSyncOverview();
      setStatusModal({
        title: result.queued ? "Sync queued" : "Sync complete",
        description: getSyncCompleteDescription(result),
      });
    } catch (error) {
      console.error("Sync now error:", error);
      setStatusModal({ title: "Error", description: "Failed to queue sync. Please try again." });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const getProviderOverview = (provider: IntegrationProvider) => {
    return syncOverview?.find((item) => item.provider === provider);
  };

  const getProviderDisplayName = (provider: IntegrationProvider) => {
    return INTEGRATIONS.find((integration) => integration.provider === provider)?.name || provider;
  };

  return (
    <View className="flex-1 bg-background" testID="integrations-screen">
      <View className="flex-row items-center border-b border-border/50 px-6 py-4">
        <Pressable onPress={handleClose} className="-ml-2 p-2" testID="back-button">
          <Icon as={ChevronLeft} size={24} />
        </Pressable>
        <Text className="ml-4 text-xl font-semibold text-foreground">Integrations</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 py-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4 gap-2">
          <Text className="text-base text-muted-foreground">
            Connect your training platforms and keep account-level sync settings together here.
          </Text>
          <Text className="text-xs text-muted-foreground">
            File imports now live with the relevant activity and route screens.
          </Text>
          {integrationsLoading ? (
            <Text className="mt-2 text-xs text-muted-foreground">
              Checking connection status...
            </Text>
          ) : null}
        </View>

        <View className="mb-4 rounded-2xl border border-border bg-muted/20 px-4 py-3">
          <Text className="text-sm text-muted-foreground">{getConnectedSummary(syncOverview)}</Text>
        </View>

        {INTEGRATIONS.map((integration) => {
          const overview = getProviderOverview(integration.provider);
          const connected = overview?.connected ?? false;
          const pendingAction = pendingByProvider[integration.provider];
          const isPending = pendingAction !== undefined;
          const canSyncNow = connected && overview?.actions.includes("sync_now");
          const needsReconnect = overview?.providerHealth.status === "needs_reconnect";
          const activityHistoryCopy = overview
            ? getActivityHistoryCopy(overview.activityHistory.status)
            : "Checking sync status...";
          const setupCopy = overview ? getSetupDataCopy(overview.setupData.status) : null;
          const plannedCopy = overview
            ? getPlannedWorkoutCopy(overview.plannedWorkouts.status)
            : null;

          return (
            <View
              key={integration.provider}
              testID={`integration-provider-${integration.provider}`}
              className={`mb-2 rounded-xl border px-4 py-3 ${
                connected ? "border-green-500 bg-green-500/10" : "border-border bg-card"
              } ${isPending ? "opacity-70" : ""}`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {integration.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {needsReconnect ? "Needs reconnect" : connected ? "Connected" : "Not connected"}
                  </Text>
                  <Text className="mt-2 text-xs text-muted-foreground">{activityHistoryCopy}</Text>
                  {setupCopy ? (
                    <Text className="mt-1 text-xs text-muted-foreground">{setupCopy}</Text>
                  ) : null}
                  {plannedCopy ? (
                    <Text className="mt-1 text-xs text-muted-foreground">{plannedCopy}</Text>
                  ) : null}
                  {overview?.activityHistory.lastError ? (
                    <Text className="mt-1 text-xs text-destructive">
                      {overview.activityHistory.lastError}
                    </Text>
                  ) : null}
                  {overview?.providerHealth.status === "needs_reconnect" ? (
                    <Text className="mt-1 text-xs text-destructive">
                      GradientPeak can no longer access this provider. Reconnect to continue
                      syncing.
                    </Text>
                  ) : null}
                </View>

                {isPending ? (
                  <ActivityIndicator size="small" />
                ) : connected ? (
                  <Icon as={Check} className="text-green-600" size={20} />
                ) : (
                  <Icon as={ChevronRight} className="text-muted-foreground" size={20} />
                )}
              </View>

              <View className="mt-3 flex-row gap-2">
                {connected ? (
                  <>
                    {needsReconnect ? (
                      <TouchableOpacity
                        disabled={isPending}
                        onPress={() => {
                          void handleConnect(integration.provider);
                        }}
                        testID={`integration-reconnect-${integration.provider}`}
                        className="rounded-full border border-border bg-background px-3 py-2"
                      >
                        <Text className="text-xs font-semibold text-foreground">Reconnect</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!needsReconnect && canSyncNow ? (
                      <TouchableOpacity
                        disabled={isPending}
                        onPress={() => {
                          void handleSyncNow(integration.provider);
                        }}
                        testID={`integration-sync-now-${integration.provider}`}
                        className="rounded-full border border-border bg-background px-3 py-2"
                      >
                        <Text className="text-xs font-semibold text-foreground">Sync now</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      disabled={isPending}
                      onPress={() => handleDisconnect(integration.provider)}
                      testID={`integration-disconnect-${integration.provider}`}
                      className="rounded-full border border-destructive/40 bg-background px-3 py-2"
                    >
                      <Text className="text-xs font-semibold text-destructive">Disconnect</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    disabled={isPending}
                    onPress={() => {
                      void handleConnect(integration.provider);
                    }}
                    testID={`integration-connect-${integration.provider}`}
                    className="rounded-full border border-border bg-background px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-foreground">Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <View className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
          <Text className="text-sm font-medium text-foreground">Automatic history import</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Supported providers import recent activity history automatically after connection.
            Manual FIT uploads remain available from My Activities.
          </Text>
        </View>
      </ScrollView>
      {disconnectingProvider ? (
        <AppConfirmModal
          description={`Disconnect ${getProviderDisplayName(disconnectingProvider)}? Existing GradientPeak activities, files, plans, and metrics stay in your account. Future provider sync will stop until you reconnect.`}
          onClose={() => setDisconnectingProvider(null)}
          primaryAction={{
            label: "Disconnect",
            onPress: () => {
              void confirmDisconnect();
            },
            variant: "destructive",
            testID: "integration-disconnect-confirm",
            disabled: pendingByProvider[disconnectingProvider] === "disconnect",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setDisconnectingProvider(null),
            variant: "outline",
          }}
          testID="integration-disconnect-modal"
          title="Disconnect Integration"
        />
      ) : null}
      {statusModal ? (
        <AppConfirmModal
          description={statusModal.description}
          onClose={() => setStatusModal(null)}
          primaryAction={{
            label: "OK",
            onPress: () => setStatusModal(null),
            testID: "integrations-status-confirm",
          }}
          testID="integrations-status-modal"
          title={statusModal.title}
        />
      ) : null}
    </View>
  );
}
