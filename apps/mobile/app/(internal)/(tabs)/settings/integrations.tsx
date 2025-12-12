import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { Alert, BackHandler, Platform, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import type { PublicIntegrationProvider } from "@repo/core";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { ChevronLeft } from "lucide-react-native";

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

  const utils = trpc.useUtils();

  // tRPC queries
  const { data: integrations, refetch } = trpc.integrations.list.useQuery();
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
    // Show "coming soon" alert for integrations not yet implemented
    const comingSoonProviders: PublicIntegrationProvider[] = [
      "strava",
      "trainingpeaks",
      "garmin",
      "zwift",
    ];

    if (comingSoonProviders.includes(provider)) {
      Alert.alert(
        "Coming Soon",
        `${getProviderDisplayName(provider)} integration will be added soon. Stay tuned!`,
      );
      return;
    }

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
      }
      // Success/error handling happens via deep link
    } catch (error) {
      console.error("OAuth initiation error:", error);
      Alert.alert("Error", "Failed to initiate connection. Please try again.");
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
            try {
              await disconnectMutation.mutateAsync({ provider });
              refetch();
              Alert.alert("Success", "Integration disconnected successfully");
            } catch (error) {
              console.error("Disconnect error:", error);
              Alert.alert("Error", "Failed to disconnect. Please try again.");
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

  const isLoading =
    getAuthUrlMutation.isPending || disconnectMutation.isPending;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-border/50">
        <Button
          onPress={handleClose}
          variant="ghost"
          className="p-2 -ml-2 "
          testID="back-button"
        >
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="text-xl font-semibold text-foreground ml-4">
          Integrations
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 gap-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-2">
          <Text className="text-muted-foreground text-base">
            Connect your fitness tracking platforms to sync activities and
            activities.
          </Text>
        </View>

        {INTEGRATIONS.map((integration) => {
          const connected = isConnected(integration.provider);

          return (
            <Card key={integration.provider} className="bg-card border-border">
              <CardContent className="p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Text className="text-lg font-semibold text-card-foreground">
                      {integration.name}
                    </Text>
                    {connected && (
                      <View className="bg-green-100 dark:bg-green-900 px-2 py-1 rounded-full">
                        <Text className="text-xs text-green-700 dark:text-green-300 font-medium">
                          Connected
                        </Text>
                      </View>
                    )}
                  </View>

                  <Button
                    onPress={() =>
                      connected
                        ? handleDisconnect(integration.provider)
                        : handleConnect(integration.provider)
                    }
                    variant={connected ? "destructive" : "default"}
                    disabled={isLoading}
                    size="sm"
                  >
                    <Text>{connected ? "Disconnect" : "Connect"}</Text>
                  </Button>
                </View>
              </CardContent>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
