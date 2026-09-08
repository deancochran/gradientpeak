import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { skipToken } from "@tanstack/react-query";
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
import { parseIntegrationOAuthCallback } from "@/lib/integration-oauth-callback";
import { productionMobileProviderActionRegistry } from "@/lib/integration-provider-actions";

function getMobileRedirectUri(): string {
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  return Linking.createURL("integrations");
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const [pendingByProvider, setPendingByProvider] = useState<
    Partial<
      Record<IntegrationProvider, "connect" | "disconnect" | "sync_now" | "refresh_setup_data">
    >
  >({});
  const [disconnectingProvider, setDisconnectingProvider] =
    useState<IntegrationOverviewItem | null>(null);
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );

  const utils = api.useUtils();
  const profileQuery = api.profiles.get.useQuery();
  const publishedStateQuery = api.athleteIntelligence.getReadModel.useQuery(
    profileQuery.data
      ? { profileId: profileQuery.data.id, sections: { publishedState: true, status: true } }
      : skipToken,
    { enabled: Boolean(profileQuery.data) },
  );
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
          integration.providerHealth.status === "disconnecting" ||
          integration.activityHistory.status === "queued" ||
          integration.activityHistory.status === "importing" ||
          integration.plannedActivities.status === "queued" ||
          integration.plannedActivities.status === "syncing" ||
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
  const invalidateIntegrations = [() => utils.integrations.getSyncOverview.invalidate()];
  const disconnectMutation = useReliableMutation(api.integrations.disconnect, {
    invalidate: invalidateIntegrations,
    success: "Disconnecting",
  });
  const syncNowMutation = useReliableMutation(api.integrations.syncNow, { silent: true });
  const refreshSetupMutation = useReliableMutation(api.integrations.refreshSetupData, {
    silent: true,
  });

  const handleDeepLink = useCallback(
    (event: { url: string }) => {
      try {
        const outcome = parseIntegrationOAuthCallback(event.url);
        if (!outcome) return;

        void utils.integrations.getSyncOverview.invalidate();
        refetchSyncOverview();
        setStatusModal({ title: outcome.title, description: outcome.description });
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
      await productionMobileProviderActionRegistry.dispatch(provider, "connect", providerActions);
    } catch {
      setStatusModal({
        title: "Connection unavailable",
        description: "This integration could not be connected. Check availability and try again.",
      });
    } finally {
      setPendingByProvider((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectingProvider) return;
    const provider = disconnectingProvider.provider;
    setPendingByProvider((prev) => ({ ...prev, [provider]: "disconnect" }));
    try {
      await productionMobileProviderActionRegistry.dispatch(
        provider,
        "disconnect",
        providerActions,
      );
      setDisconnectingProvider(null);
    } catch {
      setStatusModal({
        title: "Disconnect unavailable",
        description:
          "This integration could not be disconnected. Check availability and try again.",
      });
    } finally {
      setPendingByProvider((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }
  };

  const providerActions = {
    connectOAuth: async (provider: IntegrationProvider) => {
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
    },
    disconnectApi: async (provider: IntegrationProvider) => {
      await disconnectMutation.mutateAsync({ provider });
      await refetchSyncOverview();
    },
    syncNow: async (provider: IntegrationProvider) => {
      await syncNowMutation.mutateAsync({ provider });
      await refetchSyncOverview();
    },
    refreshSetupData: async (provider: IntegrationProvider) => {
      await refreshSetupMutation.mutateAsync({ provider });
      await refetchSyncOverview();
    },
  };

  const runProviderAction = async (
    provider: IntegrationProvider,
    action: "sync_now" | "refresh_setup_data",
  ) => {
    setPendingByProvider((prev) => ({ ...prev, [provider]: action }));
    try {
      await productionMobileProviderActionRegistry.dispatch(provider, action, providerActions);
    } catch {
      setStatusModal({
        title: "Action unavailable",
        description:
          "This integration action could not be completed. Check availability and try again.",
      });
    } finally {
      setPendingByProvider((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
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
          {...(publishedStateQuery.data ? { publishedState: publishedStateQuery.data } : {})}
          isLoading={integrationsLoading}
          onConnect={(provider) => {
            void handleConnect(provider);
          }}
          onDisconnect={setDisconnectingProvider}
          onAction={(provider, action) => void runProviderAction(provider, action)}
          onViewImportedActivities={(importRunId) =>
            router.push({ pathname: "/activities-list", params: { importRunId } })
          }
          onReviewImportedActivities={() => router.push("/activities-list")}
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
