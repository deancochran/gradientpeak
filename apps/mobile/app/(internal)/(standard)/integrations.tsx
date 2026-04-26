import { Button } from "@repo/ui/components/button";
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

const INTEGRATIONS: IntegrationConfig[] = [
  { provider: "strava", name: "Strava" },
  { provider: "wahoo", name: "Wahoo" },
  { provider: "trainingpeaks", name: "TrainingPeaks" },
  { provider: "garmin", name: "Garmin Connect" },
  { provider: "zwift", name: "Zwift" },
];

function getConnectedSummary(integrations: Array<{ provider: string }> | undefined) {
  const count = integrations?.length ?? 0;
  if (count === 0) return "No services connected";
  return `${count} connected ${count === 1 ? "service" : "services"}`;
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
    Partial<Record<IntegrationProvider, "connect" | "disconnect">>
  >({});
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationProvider | null>(
    null,
  );
  const [statusModal, setStatusModal] = useState<null | { title: string; description: string }>(
    null,
  );

  const utils = api.useUtils();
  const {
    data: integrations,
    refetch,
    isLoading: integrationsLoading,
  } = api.integrations.list.useQuery();
  const getAuthUrlMutation = useReliableMutation(api.integrations.getAuthUrl, {
    silent: true,
  });
  const disconnectMutation = useReliableMutation(api.integrations.disconnect, {
    invalidate: [utils.integrations],
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
            description: `Successfully connected to ${provider}!`,
          });
          refetch();
        } else if (error) {
          refetch();
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
    [refetch],
  );

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", handleDeepLink);
    refetch();
    return () => subscription.remove();
  }, [handleDeepLink, refetch]);

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
      refetch();
      setDisconnectingProvider(null);
      setStatusModal({ title: "Success", description: "Integration disconnected successfully" });
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusModal({ title: "Error", description: "Failed to disconnect. Please try again." });
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const isConnected = (provider: IntegrationProvider) => {
    return integrations?.some((integration) => integration.provider === provider);
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
          <Text className="text-sm text-muted-foreground">{getConnectedSummary(integrations)}</Text>
        </View>

        {INTEGRATIONS.map((integration) => {
          const connected = isConnected(integration.provider);
          const pendingAction = pendingByProvider[integration.provider];
          const isPending = pendingAction !== undefined;

          return (
            <TouchableOpacity
              key={integration.provider}
              onPress={() =>
                connected
                  ? handleDisconnect(integration.provider)
                  : handleConnect(integration.provider)
              }
              disabled={isPending}
              activeOpacity={0.7}
              testID={`integration-provider-${integration.provider}`}
              className={`mb-2 flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                connected ? "border-green-500 bg-green-500/10" : "border-border bg-card"
              } ${isPending ? "opacity-70" : ""}`}
            >
              <View>
                <Text className="text-base font-semibold text-foreground">{integration.name}</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {connected ? "Connected - tap to disconnect" : "Not connected - tap to connect"}
                </Text>
              </View>

              {isPending ? (
                <ActivityIndicator size="small" />
              ) : connected ? (
                <Icon as={Check} className="text-green-600" size={20} />
              ) : (
                <Icon as={ChevronRight} className="text-muted-foreground" size={20} />
              )}
            </TouchableOpacity>
          );
        })}

        <View className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
          <Text className="text-sm font-medium text-foreground">Need to import data?</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Use `My Activities` to import FIT activity history and `My Routes` to upload route
            files.
          </Text>
        </View>
      </ScrollView>
      {disconnectingProvider ? (
        <AppConfirmModal
          description={`Are you sure you want to disconnect from ${getProviderDisplayName(disconnectingProvider)}?`}
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
