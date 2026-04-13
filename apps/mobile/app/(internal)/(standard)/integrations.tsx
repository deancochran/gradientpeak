import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Upload,
} from "lucide-react-native";
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
import { api } from "@/lib/api";
import { useDedupedPush } from "@/lib/navigation/useDedupedPush";
import type { IntegrationProvider } from "@/lib/constants/integrations";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { FitUploader } from "@/lib/services/fit/FitUploader";

type IntegrationConfig = {
  provider: IntegrationProvider;
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

const ACTIVITY_TYPES = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Ride" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
] as const;

function isFitParseFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to parse fit file") ||
    normalized.includes("fit decode") ||
    normalized.includes("fit parser") ||
    normalized.includes("fit parse") ||
    normalized.includes("corrupt fit") ||
    normalized.includes("invalid fit") ||
    normalized.includes("bar error")
  );
}

const createOption = (value: string, label?: string) => ({
  value,
  label: label || value,
});

const buildManualHistoricalImportProvenance = (fileName: string) => ({
  import_source: "manual_historical" as const,
  import_file_type: "fit" as const,
  import_original_file_name: fileName.trim(),
});

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
  const pushIfNotCurrent = useDedupedPush();
  const queryClient = useQueryClient();
  const [pendingByProvider, setPendingByProvider] = useState<
    Partial<Record<IntegrationProvider, "connect" | "disconnect">>
  >({});

  const utils = api.useUtils();
  const [historicalName, setHistoricalName] = useState("");
  const [historicalNotes, setHistoricalNotes] = useState("");
  const [historicalActivityType, setHistoricalActivityType] = useState<string>("bike");
  const [selectedFitFile, setSelectedFitFile] = useState<{
    name: string;
    uri: string;
    size: number;
  } | null>(null);
  const [importSummary, setImportSummary] = useState<{
    activityId: string;
    name: string;
    fileName: string;
  } | null>(null);

  // API queries
  const {
    data: integrations,
    refetch,
    isLoading: integrationsLoading,
  } = api.integrations.list.useQuery();
  const getAuthUrlMutation = useReliableMutation(api.integrations.getAuthUrl, {
    silent: true, // No success message for auth URL generation
  });
  const disconnectMutation = useReliableMutation(api.integrations.disconnect, {
    invalidate: [utils.integrations],
    success: "Integration disconnected",
  });

  const getSignedUrlMutation = api.fitFiles.getSignedUploadUrl.useMutation();
  const processFitFileMutation = api.fitFiles.processFitFile.useMutation();

  const isImporting = getSignedUrlMutation.isPending || processFitFileMutation.isPending;

  const handlePickFitFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];

      if (!asset.name.toLowerCase().endsWith(".fit")) {
        Alert.alert("Unsupported file", "Choose a FIT file ending in .fit.");
        return;
      }

      const file = new File(asset.uri);
      const fileSize = asset.size ?? file.size ?? 0;

      if (fileSize <= 0) {
        Alert.alert("Unreadable file", "The selected FIT file appears to be empty.");
        return;
      }

      setSelectedFitFile({
        name: asset.name,
        uri: asset.uri,
        size: fileSize,
      });

      if (!historicalName.trim()) {
        setHistoricalName(asset.name.replace(/\.fit$/i, ""));
      }
    } catch (error) {
      console.error("Failed to pick FIT file", error);
      Alert.alert("File selection failed", "Could not open the FIT file picker.");
    }
  };

  const handleHistoricalImport = async () => {
    const trimmedName = historicalName.trim();

    if (!selectedFitFile) {
      Alert.alert("Missing file", "Choose a FIT file to import.");
      return;
    }

    if (!trimmedName) {
      Alert.alert("Missing activity name", "Enter a name for this imported activity.");
      return;
    }

    try {
      const signedUrlData = await getSignedUrlMutation.mutateAsync({
        fileName: selectedFitFile.name,
        fileSize: selectedFitFile.size,
      });

      const uploader = new FitUploader(undefined, undefined, "fit-files");

      const uploadResult = await uploader.uploadToSignedUrl(
        selectedFitFile.uri,
        signedUrlData.signedUrl,
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload FIT file");
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await processFitFileMutation.mutateAsync({
        fitFilePath: signedUrlData.filePath,
        name: trimmedName,
        notes: historicalNotes.trim() || undefined,
        activityType: historicalActivityType,
        importProvenance: buildManualHistoricalImportProvenance(selectedFitFile.name),
      });

      await invalidatePostActivityIngestionQueries(queryClient);
      await utils.activities.invalidate();

      setImportSummary({
        activityId: result.activity.id,
        name: result.activity.name,
        fileName: selectedFitFile.name,
      });
    } catch (error) {
      console.error("Historical FIT import failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("Only .fit files are supported")) {
        Alert.alert("Unsupported file", "Only FIT files are supported right now.");
        return;
      }

      if (isFitParseFailureMessage(message)) {
        Alert.alert(
          "Import failed",
          "We could not read that FIT file. Try a different export or recording.",
        );
        return;
      }

      Alert.alert(
        "Import failed",
        "The FIT activity could not be imported right now. Please try again.",
      );
    }
  };

  const handleViewImportedActivity = () => {
    if (!importSummary) return;
    pushIfNotCurrent(`/activity-detail?id=${importSummary.activityId}` as any);
  };

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
    const backHandler = BackHandler?.addEventListener?.("hardwareBackPress", () => {
      handleClose();
      return true; // Prevent default behavior
    });

    return () => backHandler?.remove?.();
  }, [handleClose]);

  const handleConnect = async (provider: IntegrationProvider) => {
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

  const handleDisconnect = async (provider: IntegrationProvider) => {
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

  const isConnected = (provider: IntegrationProvider) => {
    return integrations?.some((i) => i.provider === provider);
  };

  const getProviderDisplayName = (provider: IntegrationProvider) => {
    return INTEGRATIONS.find((i) => i.provider === provider)?.name || provider;
  };

  return (
    <View className="flex-1 bg-background" testID="integrations-screen">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-border/50">
        <Pressable onPress={handleClose} className="p-2 -ml-2" testID="back-button">
          <Icon as={ChevronLeft} size={24} />
        </Pressable>
        <Text className="text-xl font-semibold text-foreground ml-4">Integrations</Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 py-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
          <Text className="text-muted-foreground text-base">
            Connect your fitness platforms and import completed history from FIT files.
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
              testID={`integration-provider-${integration.provider}`}
              className={`flex-row items-center justify-between border rounded-xl px-4 py-3 mb-2 ${
                connected ? "border-green-500 bg-green-500/10" : "border-border bg-card"
              } ${isPending ? "opacity-70" : ""}`}
            >
              <View>
                <Text className="text-base font-semibold text-foreground">{integration.name}</Text>
                <Text className="text-xs text-muted-foreground mt-0.5">
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

        <View className="mt-6">
          <Text className="text-base font-semibold text-foreground mb-2">
            Import Activity History
          </Text>
          <Text className="text-xs text-muted-foreground mb-3">
            FIT-only for now. Older activities are imported into your normal activity history and
            may influence training insights.
          </Text>

          <View className="border border-border rounded-xl p-4 bg-card gap-3">
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 rounded-full bg-primary/10 items-center justify-center">
                <Icon as={History} size={18} className="text-primary" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-medium text-foreground">Completed FIT Activity</Text>
                <Text className="text-xs text-muted-foreground">
                  Upload one completed FIT file from your device. Other file formats stay deferred
                  for a later phase.
                </Text>
              </View>
            </View>

            {!selectedFitFile ? (
              <Button
                onPress={handlePickFitFile}
                variant="outline"
                className="justify-start gap-2"
                disabled={isImporting}
                testID="integrations-pick-fit-file-button"
              >
                <Upload className="text-foreground" size={18} />
                <Text>Choose FIT File</Text>
              </Button>
            ) : (
              <View className="border border-border rounded-xl p-3 bg-muted/40 gap-2">
                <View className="flex-row items-center gap-2">
                  <FileText className="text-foreground" size={18} />
                  <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                    {selectedFitFile.name}
                  </Text>
                  <CheckCircle className="text-green-600" size={18} />
                </View>
                <Text className="text-xs text-muted-foreground">
                  {(selectedFitFile.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
                <Button
                  onPress={handlePickFitFile}
                  variant="ghost"
                  className="self-start px-0"
                  disabled={isImporting}
                >
                  <Text className="text-sm text-primary font-medium">Choose a different file</Text>
                </Button>
              </View>
            )}

            <Input
              value={historicalName}
              onChangeText={setHistoricalName}
              placeholder="Activity name"
              autoCapitalize="sentences"
              testID="integrations-historical-name-input"
            />

            <Select
              value={createOption(historicalActivityType)}
              onValueChange={(option: { value: string; label: string } | undefined) => {
                if (option) setHistoricalActivityType(option.value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose activity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ACTIVITY_TYPES.map((activityType) => (
                    <SelectItem
                      key={activityType.value}
                      value={activityType.value}
                      label={activityType.label}
                    />
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Textarea
              value={historicalNotes}
              onChangeText={setHistoricalNotes}
              placeholder="Optional notes"
              className="min-h-[88px]"
              testID="integrations-historical-notes-input"
            />

            <Text className="text-xs text-muted-foreground">
              Supported now: `.fit` only. Historical imports keep their original timestamps.
            </Text>

            <Button
              onPress={handleHistoricalImport}
              disabled={isImporting || !selectedFitFile || !historicalName.trim()}
              testID="integrations-import-fit-button"
            >
              <Text className="text-primary-foreground font-semibold">
                {isImporting ? "Importing FIT Activity..." : "Import FIT Activity"}
              </Text>
            </Button>
          </View>

          {importSummary ? (
            <View
              className="mt-3 border border-border rounded-xl p-3 bg-muted/40"
              testID="integrations-import-summary"
            >
              <Text className="text-sm text-foreground font-medium">
                Historical activity imported
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                {importSummary.name} was created from {importSummary.fileName}.
              </Text>
              <Button
                onPress={handleViewImportedActivity}
                variant="outline"
                className="mt-3"
                testID="integrations-view-imported-activity-button"
              >
                <Text>View Activity</Text>
              </Button>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
