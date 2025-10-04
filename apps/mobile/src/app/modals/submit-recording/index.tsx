import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { useActivityRecorderInit } from "@/lib/hooks/useActivityRecorderInit";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPower,
  formatSpeed,
} from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  CheckCircle,
  Clock,
  Heart,
  Loader2,
  Mountain,
  Send,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { z } from "zod";

const activityFormSchema = z.object({
  name: z.string().min(1, "Activity name is required"),
  notes: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activityFormSchema>;

export default function SubmitRecordingModal() {
  const { recording_id } = useLocalSearchParams<{ recording_id: string }>();
  const { profile } = useRequireAuth();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get service lifecycle management
  const { markServiceCompleted, cleanupService } = useActivityRecorderInit();

  // Validate recording_id parameter
  useEffect(() => {
    if (!recording_id) {
      Alert.alert(
        "Missing Recording",
        "No recording ID provided. Please try again.",
        [
          {
            text: "Go Back",
            onPress: () => router.dismiss(),
          },
        ],
      );
    }
  }, [recording_id, router]);

  const {
    state,
    progress,
    payload,
    error,
    isPreparing,
    isReady,
    isUploading,
    isSuccess,
    updateActivityDetails,
    submit,
    retry,
  } = useActivitySubmission({
    recordingId: recording_id || "",
    profile: profile,
  });

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  // Set default form values when payload is ready
  useEffect(() => {
    if (payload) {
      form.setValue("name", payload.activity.name || "");
      form.setValue("notes", payload.activity.notes || "");
    }
  }, [payload, form]);

  // Show error toast when submission fails
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Helper function to navigate to home screen
  const navigateToHome = useCallback(async () => {
    try {
      // Mark service as completed and cleanup
      markServiceCompleted();
      await cleanupService();
    } catch (error) {
      console.error("Error cleaning up service:", error);
    } finally {
      router.push("/(internal)/(tabs)/");
    }
  }, [markServiceCompleted, cleanupService, router]);

  // Auto-close after successful submission and navigate to home
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(async () => {
        await navigateToHome();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, navigateToHome]);

  const handleSubmit = async (data: ActivityFormData) => {
    setErrorMessage(null);
    updateActivityDetails(data);
    try {
      await submit();
    } catch (err) {
      console.error("Submission failed:", err);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      "Discard Activity",
      "Are you sure you want to delete this activity?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => await navigateToHome(),
        },
      ],
    );
  };

  const getStateLabel = () => {
    switch (state) {
      case "preparing":
        return "Loading recording data...";
      case "aggregating":
        return "Aggregating stream data...";
      case "computing":
        return "Computing activity metrics...";
      case "compressing":
        return "Compressing streams...";
      default:
        return "Processing...";
    }
  };

  const canSubmit =
    recording_id &&
    isReady &&
    !isUploading &&
    !isSuccess &&
    form.formState.isValid;
  const canDelete = !isPreparing && !isUploading && recording_id;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header with 3 evenly spaced elements */}
      <View className="bg-background border-b border-border px-4 py-3 pt-12">
        <View className="flex-row items-center justify-between">
          {/* Delete Button */}
          <Button
            variant="ghost"
            size="sm"
            onPress={handleDiscard}
            disabled={!canDelete}
            className="flex-1 max-w-24"
          >
            <Icon
              as={Trash2}
              size={18}
              className={canDelete ? "text-red-600" : "text-muted-foreground"}
            />
          </Button>

          {/* Title */}
          <View className="flex-1 items-center">
            <Text className="font-semibold text-lg">Activity Summary</Text>
          </View>

          {/* Submit Button */}
          <Button
            variant="ghost"
            size="sm"
            onPress={form.handleSubmit(handleSubmit)}
            disabled={!canSubmit}
            className="flex-1 max-w-24"
          >
            {isUploading ? (
              <Icon
                as={Loader2}
                size={18}
                className="animate-spin text-primary"
              />
            ) : isSuccess ? (
              <Icon as={CheckCircle} size={18} className="text-green-600" />
            ) : (
              <Icon
                as={Send}
                size={18}
                className={canSubmit ? "text-primary" : "text-muted-foreground"}
              />
            )}
          </Button>
        </View>
      </View>

      {/* Error Banner */}
      {errorMessage && (
        <View className="bg-red-50 border-b border-red-200 px-4 py-3">
          <Text className="text-red-800 text-sm">{errorMessage}</Text>
          {error && (
            <Button variant="ghost" size="sm" onPress={retry} className="mt-2">
              <Text className="text-red-600 text-xs">Retry</Text>
            </Button>
          )}
        </View>
      )}

      {/* Success Banner */}
      {isSuccess && (
        <View className="bg-green-50 border-b border-green-200 px-4 py-3">
          <View className="flex-row items-center">
            <Icon as={CheckCircle} size={20} className="text-green-600 mr-2" />
            <Text className="text-green-800 text-sm font-medium">
              Activity submitted successfully! Closing...
            </Text>
          </View>
        </View>
      )}

      {/* Scrollable Body */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
      >
        {/* Loading State */}
        {isPreparing && (
          <View className="items-center justify-center py-16 px-6">
            <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-6">
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
            <Text className="text-base font-semibold mb-2">
              {getStateLabel()}
            </Text>
            <View className="w-full max-w-xs bg-gray-200 rounded-full h-1.5 mb-2 mt-4">
              <View
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </View>
            <Text className="text-xs text-muted-foreground">
              {Math.round(progress)}%
            </Text>
          </View>
        )}

        {/* Ready State - Activity Content */}
        {isReady && payload && (
          <Form {...form}>
            <View className="px-6 pt-6 space-y-6">
              {/* Editable Activity Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activity Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter activity name"
                        value={field.value}
                        onChangeText={field.onChange}
                        className="text-lg font-semibold"
                        editable={!isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Readonly Activity Info */}
              <View className="bg-muted/30 rounded-xl p-4 space-y-3">
                <Text className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Activity Details
                </Text>

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">Date</Text>
                  <View className="flex-row items-center">
                    <Icon
                      as={Calendar}
                      size={16}
                      className="text-muted-foreground mr-2"
                    />
                    <Text className="text-sm font-medium">
                      {new Date(
                        payload.activity.started_at,
                      ).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Start Time
                  </Text>
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={16}
                      className="text-muted-foreground mr-2"
                    />
                    <Text className="text-sm font-medium">
                      {new Date(payload.activity.started_at).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-muted-foreground">
                    Activity Type
                  </Text>
                  <View className="flex-row items-center">
                    <Icon
                      as={Activity}
                      size={16}
                      className="text-muted-foreground mr-2"
                    />
                    <Text className="text-sm font-medium capitalize">
                      {payload.activity.activity_type?.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Primary Metrics - Readonly */}
              <View className="space-y-4">
                <Text className="text-base font-semibold">Primary Metrics</Text>
                <View className="grid grid-cols-2 gap-3">
                  <View className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                    <Icon as={Clock} size={20} className="text-primary mb-2" />
                    <Text className="text-xs text-muted-foreground mb-1">
                      Duration
                    </Text>
                    <Text className="text-xl font-bold">
                      {payload.activity.elapsed_time
                        ? formatDuration(payload.activity.elapsed_time / 1000)
                        : "--"}
                    </Text>
                  </View>

                  {payload.activity.total_distance && (
                    <View className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10">
                      <Icon
                        as={Mountain}
                        size={20}
                        className="text-blue-500 mb-2"
                      />
                      <Text className="text-xs text-muted-foreground mb-1">
                        Distance
                      </Text>
                      <Text className="text-xl font-bold">
                        {formatDistance(payload.activity.total_distance)}
                      </Text>
                    </View>
                  )}

                  {payload.activity.avg_speed && (
                    <View className="bg-green-500/5 rounded-xl p-4 border border-green-500/10">
                      <Icon
                        as={Zap}
                        size={20}
                        className="text-green-500 mb-2"
                      />
                      <Text className="text-xs text-muted-foreground mb-1">
                        Avg Speed
                      </Text>
                      <Text className="text-xl font-bold">
                        {formatSpeed(payload.activity.avg_speed)}
                      </Text>
                    </View>
                  )}

                  {payload.activity.avg_heartrate && (
                    <View className="bg-red-500/5 rounded-xl p-4 border border-red-500/10">
                      <Icon
                        as={Heart}
                        size={20}
                        className="text-red-500 mb-2"
                      />
                      <Text className="text-xs text-muted-foreground mb-1">
                        Avg HR
                      </Text>
                      <Text className="text-xl font-bold">
                        {formatHeartRate(payload.activity.avg_heartrate)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Additional Metrics Grid */}
              {(payload.activity.avg_power ||
                payload.activity.max_heartrate ||
                payload.activity.max_speed) && (
                <View className="space-y-4">
                  <Text className="text-base font-semibold">
                    Additional Metrics
                  </Text>
                  <View className="bg-card rounded-xl border p-4 space-y-3">
                    {payload.activity.avg_power && (
                      <MetricRow
                        label="Average Power"
                        value={formatPower(payload.activity.avg_power)}
                      />
                    )}
                    {payload.activity.max_power && (
                      <MetricRow
                        label="Max Power"
                        value={formatPower(payload.activity.max_power)}
                      />
                    )}
                    {payload.activity.max_heartrate && (
                      <MetricRow
                        label="Max Heart Rate"
                        value={formatHeartRate(payload.activity.max_heartrate)}
                      />
                    )}
                    {payload.activity.max_speed && (
                      <MetricRow
                        label="Max Speed"
                        value={formatSpeed(payload.activity.max_speed)}
                      />
                    )}
                    {payload.activity.total_elevation_gain && (
                      <MetricRow
                        label="Elevation Gain"
                        value={`${payload.activity.total_elevation_gain.toFixed(0)}m`}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Advanced Metrics */}
              {(payload.activity.intensity_factor ||
                payload.activity.variability_index ||
                payload.activity.efficiency_factor ||
                payload.activity.power_weight_ratio) && (
                <View className="space-y-4">
                  <Text className="text-base font-semibold">
                    Advanced Metrics
                  </Text>
                  <View className="bg-card rounded-xl border p-4 space-y-3">
                    {payload.activity.intensity_factor && (
                      <MetricRow
                        label="Intensity Factor"
                        value={payload.activity.intensity_factor.toFixed(2)}
                      />
                    )}
                    {payload.activity.variability_index && (
                      <MetricRow
                        label="Variability Index"
                        value={payload.activity.variability_index.toFixed(2)}
                      />
                    )}
                    {payload.activity.efficiency_factor && (
                      <MetricRow
                        label="Efficiency Factor"
                        value={payload.activity.efficiency_factor.toFixed(2)}
                      />
                    )}
                    {payload.activity.power_weight_ratio && (
                      <MetricRow
                        label="Power/Weight Ratio"
                        value={`${payload.activity.power_weight_ratio.toFixed(2)} W/kg`}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Editable Notes Section */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add notes about your activity..."
                        value={field.value || ""}
                        onChangeText={field.onChange}
                        numberOfLines={4}
                        className="min-h-24"
                        editable={!isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submission Status */}
              {(isUploading || isSuccess) && (
                <View className="bg-muted/30 rounded-xl p-4 items-center">
                  {isUploading && (
                    <>
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text className="text-sm font-medium mt-2">
                        Submitting Activity...
                      </Text>
                    </>
                  )}
                  {isSuccess && (
                    <>
                      <Icon
                        as={CheckCircle}
                        size={24}
                        className="text-green-600"
                      />
                      <Text className="text-sm font-medium mt-2 text-green-700">
                        Activity Submitted Successfully!
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-1">
                        Returning to home screen...
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>
          </Form>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center">
    <Text className="text-sm text-muted-foreground">{label}</Text>
    <Text className="text-sm font-semibold">{value}</Text>
  </View>
);
