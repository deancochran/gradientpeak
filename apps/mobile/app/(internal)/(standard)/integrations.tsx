import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import type { PublicIntegrationProvider } from "@repo/supabase";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Check, ChevronLeft, ChevronRight } from "lucide-react-native";

type IntegrationConfig = {
  provider: PublicIntegrationProvider;
  name: string;
};

const INTEGRATIONS: IntegrationConfig[] = [
  {
    provider: "strava",
    name: "Strava",
  },
  {
    provider: "wahoo",
    name: "Wahoo",
  },
  {
    provider: "trainingpeaks",
    name: "TrainingPeaks",
  },
  {
    provider: "garmin",
    name: "Garmin Connect",
  },
  {
    provider: "zwift",
    name: "Zwift",
  },
];

/**
 * Get the mobile redirect URI based on environment
 */
function getMobileRedirectUri(): string {
  // Use environment variable if set
  if (Constants.expoConfig?.extra?.redirectUri) {
    return Constants.expoConfig.extra.redirectUri;
  }

  // Default to the app scheme
  return Linking.createURL("integrations");
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const [pendingByProvider, setPendingByProvider] = useState<
    Partial<Record<PublicIntegrationProvider, "connect" | "disconnect">>
  >({});

  const utils = trpc.useUtils();

  // tRPC queries
  const {
    data: integrations,
    refetch,
    isLoading: integrationsLoading,
  } = trpc.integrations.list.useQuery();
  const getAuthUrlMutation = useReliableMutation(trpc.integrations.getAuthUrl, {
    silent: true, // No success message for auth URL generation
  });
  const disconnectMutation = useReliableMutation(trpc.integrations.disconnect, {
    invalidate: [utils.integrations],
    success: "Integration disconnected",
  });

  // Handle deep link and trigger cleanup via refetch
  const handleDeepLink = useCallback(
    (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        const success = url.searchParams.get("success");
        const error = url.searchParams.get("error");
        const provider = url.searchParams.get("provider");
        const errorDetail = url.searchParams.get("error_detail");

        if (success === "true") {
          Alert.alert("Success", `Successfully connected to ${provider}!`);
          // Refetch integrations - this also cleans up expired states
          refetch();
        } else if (error) {
          // Even on error, refetch to trigger cleanup of expired states
          refetch();
          let errorMessage = "Failed to connect";
          switch (error) {
            case "invalid_state":
              errorMessage = "Security validation failed. Please try again.";
              break;
            case "missing_code":
              errorMessage =
                "Authorization was not completed. Please try again.";
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
          Alert.alert("Error", errorMessage);
        }
      } catch (err) {
        console.error("Failed to parse deep link:", err);
      }
    },
    [refetch],
  );

  // Handle close action
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Handle deep link return from OAuth
  useEffect(() => {
    const subscription = Linking.addEventListener("url", handleDeepLink);
    // Refetch on mount to get fresh data and clean expired states
    refetch();
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleClose();
        return true; // Prevent default behavior
      },
    );

    return () => backHandler.remove();
  }, [handleClose]);

  const handleConnect = async (provider: PublicIntegrationProvider) => {
    setPendingByProvider((prev) => ({ ...prev, [provider]: "connect" }));

    try {
      // Get the redirect URI for the current environment
      const redirectUri = getMobileRedirectUri();

      // This automatically cleans up expired states before creating a new one
      const { url } = await getAuthUrlMutation.mutateAsync({
        provider,
        redirectUri,
      });

      // Open OAuth flow in browser
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri, {
        // Use system browser on iOS for better OAuth support
        preferEphemeralSession: Platform.OS === "ios",
      });

      if (result.type === "cancel") {
        Alert.alert("Cancelled", "OAuth flow was cancelled");
      } else if (result.type === "success" && "url" in result && result.url) {
        handleDeepLink({ url: result.url });
      }
      // Success/error handling happens via deep link
    } catch (error) {
      console.error("OAuth initiation error:", error);
      Alert.alert("Error", "Failed to initiate connection. Please try again.");
    } finally {
      setPendingByProvider((prev) => ({ ...prev, [provider]: undefined }));
    }
  };

  const handleDisconnect = async (provider: PublicIntegrationProvider) => {
    Alert.alert(
      "Disconnect Integration",
      `Are you sure you want to disconnect from ${getProviderDisplayName(provider)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setPendingByProvider((prev) => ({
              ...prev,
              [provider]: "disconnect",
            }));
            try {
              await disconnectMutation.mutateAsync({ provider });
              refetch();
              Alert.alert("Success", "Integration disconnected successfully");
            } catch (error) {
              console.error("Disconnect error:", error);
              Alert.alert("Error", "Failed to disconnect. Please try again.");
            } finally {
              setPendingByProvider((prev) => ({
                ...prev,
                [provider]: undefined,
              }));
            }
          },
        },
      ],
    );
  };

  const isConnected = (provider: PublicIntegrationProvider) => {
    return integrations?.some((i) => i.provider === provider);
  };

  const getProviderDisplayName = (provider: PublicIntegrationProvider) => {
    return INTEGRATIONS.find((i) => i.provider === provider)?.name || provider;
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-border/50">
        <Pressable
          onPress={handleClose}
          className="p-2 -ml-2"
          testID="back-button"
        >
          <Icon as={ChevronLeft} size={24} />
        </Pressable>
        <Text className="text-xl font-semibold text-foreground ml-4">
          Integrations
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 py-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
          <Text className="text-muted-foreground text-base">
            Connect your fitness platforms to sync planned and completed
            activities.
          </Text>
          {integrationsLoading ? (
            <Text className="text-xs text-muted-foreground mt-2">
              Checking connection status...
            </Text>
          ) : null}
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
              className={`flex-row items-center justify-between border rounded-xl px-4 py-3 mb-2 ${
                connected
                  ? "border-green-500 bg-green-500/10"
                  : "border-border bg-card"
              } ${isPending ? "opacity-70" : ""}`}
            >
              <View>
                <Text className="text-base font-semibold text-foreground">
                  {integration.name}
                </Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
                  {connected
                    ? "Connected - tap to disconnect"
                    : "Not connected - tap to connect"}
                </Text>
              </View>

              {isPending ? (
                <ActivityIndicator size="small" />
              ) : connected ? (
                <Icon as={Check} className="text-green-600" size={20} />
              ) : (
                <Icon
                  as={ChevronRight}
                  className="text-muted-foreground"
                  size={20}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
