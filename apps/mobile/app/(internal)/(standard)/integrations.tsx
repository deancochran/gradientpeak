import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AlertCircle, Check, ChevronLeft, Link, RefreshCcw, Unlink } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import type { IntegrationProvider } from "@/lib/constants/integrations";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";

type IntegrationOverviewItem = {
  actions: Array<"refresh_setup_data" | "sync_now" | "disconnect">;
  activityHistory: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status: "idle" | "queued" | "importing" | "synced" | "failed" | "unsupported";
  };
  configured: boolean;
  connected: boolean;
  integrationId: string | null;
  label: string;
  plannedWorkouts: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status: "automatic" | "queued" | "syncing" | "failed" | "unsupported";
  };
  primaryAction: "connect" | "disconnect" | "reconnect" | null;
  provider: IntegrationProvider;
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
  summary: {
    badge: string;
    health: "connected" | "syncing" | "queued" | "needs_reconnect" | "failed" | "unavailable";
    subtitle: string;
    title: string;
  };
};

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

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

export default function IntegrationsScreen() {
  const router = useRouter();
  const [pendingByProvider, setPendingByProvider] = useState<
    Partial<Record<IntegrationProvider, "connect" | "disconnect">>
  >({});
  const [disconnectingProvider, setDisconnectingProvider] =
    useState<IntegrationOverviewItem | null>(null);
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );

  const utils = api.useUtils();
  const {
    data: syncOverview,
    refetch: refetchSyncOverview,
    isLoading: integrationsLoading,
  } = api.integrations.getSyncOverview.useQuery(undefined, {
    refetchInterval: (query) => {
      const overview = query.state.data as IntegrationOverviewItem[] | undefined;
      const hasTransitionalState = overview?.some(
        (integration) =>
          integration.activityHistory.status === "queued" ||
          integration.activityHistory.status === "importing" ||
          integration.plannedWorkouts.status === "queued" ||
          integration.plannedWorkouts.status === "syncing" ||
          integration.setupData.status === "refreshing",
      );

      return hasTransitionalState ? 5000 : false;
    },
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
  const getAuthUrlMutation = useReliableMutation(api.integrations.getAuthUrl, {
    silent: true,
  });
  const invalidateIntegrations = [
    () => utils.integrations.getSyncOverview.invalidate(),
    () => utils.integrations.list.invalidate(),
  ];
  const disconnectMutation = useReliableMutation(api.integrations.disconnect, {
    invalidate: invalidateIntegrations,
    success: "Disconnected",
  });

  const visibleIntegrations = useMemo(
    () => (syncOverview ?? []).filter((integration) => integration.configured),
    [syncOverview],
  );
  const readyCount = visibleIntegrations.filter(
    (integration) => integration.providerHealth.status === "connected",
  ).length;

  const handleDeepLink = useCallback(
    (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        const success = url.searchParams.get("success");
        const error = url.searchParams.get("error");
        const provider = url.searchParams.get("provider");
        const errorDetail = url.searchParams.get("error_detail");

        if (success === "true") {
          setStatusModal({ title: "Connected", description: provider ?? "Integration connected" });
          void utils.integrations.getSyncOverview.invalidate();
          void utils.integrations.list.invalidate();
          refetchSyncOverview();
        } else if (error) {
          void utils.integrations.getSyncOverview.invalidate();
          void utils.integrations.list.invalidate();
          refetchSyncOverview();
          let errorMessage = "Connection failed";
          switch (error) {
            case "invalid_state":
              errorMessage = "Session expired. Try again.";
              break;
            case "missing_code":
              errorMessage = "Authorization incomplete.";
              break;
            case "database_error":
            case "store_integration_failed":
              errorMessage = "Could not save connection.";
              break;
            case "server_error":
              errorMessage = "Server error. Try again.";
              break;
            case "token_exchange_failed":
              errorMessage = errorDetail
                ? `Provider error: ${errorDetail}`
                : "Token exchange failed.";
              break;
            case "invalid_provider":
              errorMessage = "Provider unavailable.";
              break;
            default:
              errorMessage = `Connection failed: ${error}`;
          }
          setStatusModal({ title: "Issue", description: errorMessage });
        }
      } catch (err) {
        console.error("Failed to parse deep link:", err);
      }
    },
    [refetchSyncOverview, utils],
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
        setStatusModal({ title: "Cancelled", description: "Connection cancelled." });
      } else if (result.type === "success" && "url" in result && result.url) {
        handleDeepLink({ url: result.url });
      }
    } catch (error) {
      console.error("OAuth initiation error:", error);
      setStatusModal({ title: "Issue", description: "Could not start connection." });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectingProvider) return;
    const provider = disconnectingProvider.provider;
    setPendingByProvider((prev) => ({ ...prev, [provider]: "disconnect" }));
    try {
      await disconnectMutation.mutateAsync({ provider });
      refetchSyncOverview();
      setDisconnectingProvider(null);
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusModal({ title: "Issue", description: "Could not disconnect." });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
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
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {integrationsLoading
              ? "Checking…"
              : `${readyCount}/${visibleIntegrations.length} ready`}
          </Text>
          {integrationsLoading ? <ActivityIndicator size="small" /> : null}
        </View>

        <View className="gap-2">
          {visibleIntegrations.map((integration) => {
            const pendingAction = pendingByProvider[integration.provider];
            const isPending = pendingAction !== undefined;
            const error = getProviderError(integration);
            const primaryAction = integration.primaryAction;
            const statusTone = getStatusTone(integration.summary.health);

            return (
              <View
                key={integration.provider}
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
                    <ActivityIndicator size="small" />
                  ) : primaryAction === "connect" ? (
                    <Pressable
                      disabled={isPending}
                      onPress={() => {
                        void handleConnect(integration.provider);
                      }}
                      accessibilityLabel={`Connect ${integration.label}`}
                      testID={`integration-connect-${integration.provider}`}
                      className="rounded-full border border-border bg-background p-2"
                    >
                      <Icon as={Link} size={18} className="text-foreground" />
                    </Pressable>
                  ) : primaryAction === "reconnect" ? (
                    <Pressable
                      disabled={isPending}
                      onPress={() => {
                        void handleConnect(integration.provider);
                      }}
                      accessibilityLabel={`Reconnect ${integration.label}`}
                      testID={`integration-reconnect-${integration.provider}`}
                      className="rounded-full border border-destructive/30 bg-background p-2"
                    >
                      <Icon as={RefreshCcw} size={18} className="text-destructive" />
                    </Pressable>
                  ) : primaryAction === "disconnect" ? (
                    <Pressable
                      disabled={isPending}
                      onPress={() => setDisconnectingProvider(integration)}
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

        {!integrationsLoading && visibleIntegrations.length === 0 ? (
          <View className="rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm font-semibold text-foreground">No integrations</Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Server credentials are not configured.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {disconnectingProvider ? (
        <AppConfirmModal
          description={`Disconnect ${disconnectingProvider.label}? Your GradientPeak data stays. Sync stops.`}
          onClose={() => setDisconnectingProvider(null)}
          primaryAction={{
            label: "Disconnect",
            onPress: () => {
              void confirmDisconnect();
            },
            variant: "destructive",
            testID: "integration-disconnect-confirm",
            disabled: pendingByProvider[disconnectingProvider.provider] === "disconnect",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setDisconnectingProvider(null),
            variant: "outline",
          }}
          testID="integration-disconnect-modal"
          title="Disconnect"
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
