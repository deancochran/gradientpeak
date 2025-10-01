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
  ArrowLeft,
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
import { useEffect, useState } from "react";
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
  const { recordingId } = useLocalSearchParams<{ recordingId: string }>();
  const { profile } = useRequireAuth();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    state,
    progress,
    payload,
    error,
    isPreparing,
    isReady,
    isUploading,
    isSuccess,
    prepare,
    updateActivityDetails,
    submit,
    retry,
  } = useActivitySubmission({
    recordingId: recordingId!,
    profile: profile,
  });

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  // Auto-prepare on mount
  useEffect(() => {
    if (state === "idle") {
      prepare();
    }
  }, [state, prepare]);

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

  // Auto-close after successful submission
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => router.dismiss(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, router]);

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
      "Are you sure you want to delete this activity? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // TODO: Implement discard logic
            router.dismiss();
          },
        },
      ],
    );
  };

  const handleClose = () => {
    if (isPreparing || isUploading) {
      return;
    }
    router.dismiss();
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 pt-12">
        <View className="flex-row items-center">
          <Button
            size="icon"
            variant="ghost"
            onPress={handleClose}
            disabled={isPreparing || isUploading}
          >
            <Icon as={ArrowLeft} size={24} />
          </Button>
          <Text className="flex-1 text-center font-semibold text-lg mr-10">
            Review Activity
          </Text>
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
        contentContainerClassName="pb-4"
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
            {/* Activity Header */}
            <View className="px-6 pt-6 pb-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="mb-4">
                    <FormControl>
                      <Input
                        placeholder="Activity name"
                        value={field.value}
                        onChangeText={field.onChange}
                        className="text-2xl font-bold h-14"
                        editable={!isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <View className="flex-row items-center space-x-4">
                <View className="flex-row items-center">
                  <Icon
                    as={Calendar}
                    size={16}
                    className="text-muted-foreground mr-2"
                  />
                  <Text className="text-sm text-muted-foreground">
                    {new Date(payload.activity.started_at).toLocaleDateString()}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Icon
                    as={Clock}
                    size={16}
                    className="text-muted-foreground mr-2"
                  />
                  <Text className="text-sm text-muted-foreground">
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
            </View>

            {/* Primary Stats */}
            <View className="px-6 pb-6">
              <View className="flex-row space-x-3">
                <View className="flex-1 bg-primary/5 rounded-2xl p-4 border border-primary/10">
                  <Icon as={Clock} size={20} className="text-primary mb-2" />
                  <Text className="text-xs text-muted-foreground mb-1">
                    Duration
                  </Text>
                  <Text className="text-2xl font-bold">
                    {payload.activity.elapsed_time
                      ? formatDuration(payload.activity.elapsed_time / 1000)
                      : "--"}
                  </Text>
                </View>

                <View className="flex-1 bg-blue-50 rounded-2xl p-4 border border-blue-100">
                  <Icon
                    as={Activity}
                    size={20}
                    className="text-blue-600 mb-2"
                  />
                  <Text className="text-xs text-muted-foreground mb-1">
                    Distance
                  </Text>
                  <Text className="text-2xl font-bold text-blue-600">
                    {payload.activity.distance
                      ? formatDistance(payload.activity.distance)
                      : "--"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Metrics Grid */}
            <View className="px-6 pb-6">
              <Text className="text-base font-semibold mb-3">
                Performance Metrics
              </Text>
              <View className="flex-row flex-wrap -mx-1.5">
                {payload.activity.avg_speed && (
                  <MetricCard
                    icon={Activity}
                    label="Avg Speed"
                    value={formatSpeed(payload.activity.avg_speed)}
                    color="text-blue-600"
                  />
                )}
                {payload.activity.avg_heart_rate && (
                  <MetricCard
                    icon={Heart}
                    label="Avg Heart Rate"
                    value={formatHeartRate(payload.activity.avg_heart_rate)}
                    color="text-red-600"
                  />
                )}
                {payload.activity.avg_power && (
                  <MetricCard
                    icon={Zap}
                    label="Avg Power"
                    value={formatPower(payload.activity.avg_power)}
                    color="text-yellow-600"
                  />
                )}
                {payload.activity.max_heart_rate && (
                  <MetricCard
                    icon={Heart}
                    label="Max Heart Rate"
                    value={formatHeartRate(payload.activity.max_heart_rate)}
                    color="text-red-500"
                  />
                )}
                {payload.activity.normalized_power && (
                  <MetricCard
                    icon={Zap}
                    label="Normalized Power"
                    value={formatPower(payload.activity.normalized_power)}
                    color="text-yellow-500"
                  />
                )}
                {payload.activity.total_ascent !== undefined && (
                  <MetricCard
                    icon={Mountain}
                    label="Elevation Gain"
                    value={`${Math.round(payload.activity.total_ascent)}m`}
                    color="text-green-600"
                  />
                )}
                {payload.activity.calories && (
                  <MetricCard
                    icon={Zap}
                    label="Calories"
                    value={`${Math.round(payload.activity.calories)}`}
                    color="text-orange-600"
                  />
                )}
                {payload.activity.training_stress_score && (
                  <MetricCard
                    icon={Activity}
                    label="TSS"
                    value={Math.round(
                      payload.activity.training_stress_score,
                    ).toString()}
                    color="text-purple-600"
                  />
                )}
              </View>
            </View>

            {/* Advanced Metrics */}
            {(payload.activity.intensity_factor ||
              payload.activity.variability_index ||
              payload.activity.efficiency_factor) && (
              <View className="px-6 pb-6">
                <Text className="text-base font-semibold mb-3">
                  Advanced Metrics
                </Text>
                <View className="bg-card rounded-2xl border p-4 space-y-3">
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
                      value={`${payload.activity.power_weight_ratio.toFixed(
                        2,
                      )} W/kg`}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Notes Section */}
            <View className="px-6 pb-6">
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
            </View>

            {/* Discard Button */}
            <View className="px-6 pb-6">
              <Button
                onPress={handleDiscard}
                variant="ghost"
                className="w-full"
                disabled={isUploading}
              >
                <Icon as={Trash2} size={18} className="text-red-600" />
                <Text className="ml-2 text-red-600">Discard Activity</Text>
              </Button>
            </View>
          </Form>
        )}
      </ScrollView>

      {/* Fixed Footer - Always Visible */}
      <View className="bg-background border-t border-border px-6 py-4 pb-8">
        <Button
          onPress={form.handleSubmit(handleSubmit)}
          disabled={isPreparing || isUploading || isSuccess || !isReady}
          className="w-full h-14 rounded-2xl"
        >
          {isUploading ? (
            <>
              <Icon as={Loader2} size={20} className="animate-spin" />
              <Text className="ml-2 font-semibold text-base">
                Submitting...
              </Text>
            </>
          ) : isSuccess ? (
            <>
              <Icon as={CheckCircle} size={20} />
              <Text className="ml-2 font-semibold text-base">Submitted!</Text>
            </>
          ) : (
            <>
              <Icon as={Send} size={20} />
              <Text className="ml-2 font-semibold text-base">
                Submit Activity
              </Text>
            </>
          )}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const MetricCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) => (
  <View className="w-1/2 px-1.5 mb-3">
    <View className="bg-card rounded-xl border p-3">
      <View className="flex-row items-center mb-2">
        <Icon as={icon} size={16} className={`${color} mr-2`} />
        <Text className="text-xs text-muted-foreground flex-1">{label}</Text>
      </View>
      <Text className={`text-lg font-semibold ${color}`}>{value}</Text>
    </View>
  </View>
);

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between items-center">
    <Text className="text-sm text-muted-foreground">{label}</Text>
    <Text className="text-sm font-semibold">{value}</Text>
  </View>
);
