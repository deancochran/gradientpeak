import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, View } from "react-native";
import {
  type IntegrationOverviewItem,
  IntegrationProviderList,
} from "@/components/integrations/IntegrationProviderList";
import { AppConfirmModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import type { IntegrationProvider } from "@/lib/constants/integrations";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
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
    error: syncOverviewError,
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
        <IntegrationProviderList
          error={syncOverviewError}
          integrations={syncOverview ?? []}
          isLoading={integrationsLoading}
          onConnect={(provider) => {
            void handleConnect(provider);
          }}
          onDisconnect={setDisconnectingProvider}
          pendingByProvider={pendingByProvider}
          onRetry={refetchSyncOverview}
        />
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
