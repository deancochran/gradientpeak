import {
  ActivityHeader,
  ActivityRouteMap,
  ElevationProfileChart,
  MetricCard,
  MultiMetricChart,
} from "@/components/activity";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
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
import { useActivityStreams } from "@/lib/hooks/useActivityStreams";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  activitySubmissionFormSchema,
  type ActivitySubmissionFormData,
} from "@repo/core";
import { useRouter } from "expo-router";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Send,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

// Type for activity metrics
interface ActivityMetrics {
  tss?: number;
  intensity_factor?: number;
  if?: number;
  variability_index?: number;
  vi?: number;
  efficiency_factor?: number;
  ef?: number;
  adherence_score?: number;
  avg_power?: number;
  avg_heart_rate?: number;
  avg_speed?: number;
  [key: string]: unknown;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function SubmitScreen() {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  const service = useSharedActivityRecorder();
  const submission = useActivitySubmission(service);

  const form = useForm<ActivitySubmissionFormData>({
    resolver: zodResolver(activitySubmissionFormSchema) as any,
    defaultValues: {
      name: submission.activity?.name || "",
      notes: submission.activity?.notes,
      is_private: false,
    } as ActivitySubmissionFormData,
  });

  // Decompress and process streams
  const {
    streams,
    hasGPS,
    hasHeartRate,
    hasPower,
    hasSpeed,
    hasElevation,
    getGPSCoordinates,
    getGPSCoordinatesWithTimestamps,
    getElevationStream,
  } = useActivityStreams(submission.activity?.activity_streams);

  // Memoize handlers to prevent re-renders
  const handleSubmit = useCallback(
    async (data: ActivitySubmissionFormData) => {
      // Only pass name and notes to submission.update
      submission.update({ name: data.name, notes: data.notes ?? undefined });
      await submission.submit();
      if (service) {
        await service.cleanup();
      }
      // Navigate back twice: once to close submit screen, once to close record modal
      router.back();
      router.back();
    },
    [submission, service, router],
  );

  const handleDiscard = useCallback(() => {
    Alert.alert(
      "Discard Activity",
      "Are you sure you want to delete this activity?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Clean up stream files
            if (service) {
              await service.liveMetricsManager.streamBuffer.cleanup();
              await service.cleanup();
            }
            // Navigate back twice: once to close submit screen, once to close record modal
            router.back();
            router.back();
          },
        },
      ],
    );
  }, [service, router]);

  // Memoize canSubmit to prevent unnecessary re-renders
  const activityName = form.watch("name");
  const canSubmit = useMemo(
    () => activityName?.trim().length > 0 && !submission.isUploading,
    [activityName, submission.isUploading],
  );

  // Extract and memoize metrics
  const { avgPower, avgHeartRate, analytics } = useMemo(() => {
    const metrics = submission.activity?.metrics as ActivityMetrics | null;
    return {
      avgPower: metrics?.avg_power,
      avgHeartRate: metrics?.avg_heart_rate,
      analytics: {
        tss: metrics?.tss,
        intensityFactor: metrics?.intensity_factor ?? metrics?.if,
        variabilityIndex: metrics?.variability_index ?? metrics?.vi,
        efficiencyFactor: metrics?.efficiency_factor ?? metrics?.ef,
        adherenceScore: metrics?.adherence_score,
      },
    };
  }, [submission.activity?.metrics]);

  // Get stream data (already memoized by the hook)
  const gpsCoordinates = getGPSCoordinates();
  const gpsData = getGPSCoordinatesWithTimestamps();
  const speedStream = streams.get("speed");
  const speedColorData = speedStream?.values as number[] | undefined;
  const elevationStreamData = getElevationStream();
  const distanceStream = streams.get("distance");

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="bg-background/95 backdrop-blur border-b border-border/50 px-6 py-4 pt-14">
        <View className="flex-row items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onPress={handleDiscard}
            disabled={submission.isUploading}
            className="p-2"
          >
            <Icon
              as={Trash2}
              size={20}
              className={
                submission.isUploading
                  ? "text-muted-foreground/50"
                  : "text-destructive"
              }
            />
          </Button>

          <Text className="text-xl font-semibold">Activity Summary</Text>

          <Button
            variant="ghost"
            size="sm"
            onPress={form.handleSubmit(handleSubmit)}
            disabled={!canSubmit}
            className="p-2"
          >
            {submission.isUploading ? (
              <Icon
                as={Loader2}
                size={20}
                className="animate-spin text-primary"
              />
            ) : submission.isSuccess ? (
              <Icon as={CheckCircle} size={20} className="text-green-600" />
            ) : (
              <Icon
                as={Send}
                size={20}
                className={
                  canSubmit ? "text-primary" : "text-muted-foreground/50"
                }
              />
            )}
          </Button>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
      >
        {submission.activity && (
          <Form {...form}>
            <View className="px-6 pt-6 space-y-6">
              {/* Activity Name Input */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Activity Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter activity name"
                        value={field.value}
                        onChangeText={field.onChange}
                        className="text-base py-3"
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quick Preview - GPS Route Map */}
              {hasGPS && (
                <View>
                  <Text className="text-base font-semibold mb-3">
                    Route Preview
                  </Text>
                  <ActivityRouteMap
                    coordinates={gpsCoordinates}
                    timestamps={gpsData.timestamps}
                    colorBy="speed"
                    colorData={speedColorData}
                    height={200}
                    showMarkers={true}
                  />
                </View>
              )}

              {/* Key Metrics Grid */}
              <View>
                <Text className="text-base font-semibold mb-3">
                  Key Metrics
                </Text>
                <View className="flex-row gap-2 mb-2">
                  {submission.activity.distance_meters > 0 && (
                    <MetricCard
                      icon={MapPin}
                      label="Distance"
                      value={formatDistance(
                        submission.activity.distance_meters,
                      )}
                    />
                  )}
                  <MetricCard
                    icon={Clock}
                    label="Duration"
                    value={formatDuration(submission.activity.duration_seconds)}
                  />
                </View>
                <View className="flex-row gap-2">
                  {avgHeartRate && (
                    <MetricCard
                      icon={Heart}
                      label="Avg HR"
                      value={avgHeartRate}
                      unit="bpm"
                    />
                  )}
                  {avgPower && (
                    <MetricCard
                      icon={Zap}
                      label="Avg Power"
                      value={avgPower}
                      unit="W"
                    />
                  )}
                </View>
              </View>

              {/* Analytics Summary */}
              {hasAnalytics(submission.activity) && (
                <View className="space-y-3">
                  <Text className="text-base font-semibold">Analytics</Text>
                  <View className="bg-card rounded-2xl border p-4 space-y-3">
                    {analytics.tss && (
                      <MetricRow
                        label="Training Stress Score"
                        value={Math.round(analytics.tss).toString()}
                      />
                    )}
                    {analytics.intensityFactor && (
                      <MetricRow
                        label="Intensity Factor"
                        value={analytics.intensityFactor.toFixed(2)}
                      />
                    )}
                    {analytics.variabilityIndex && (
                      <MetricRow
                        label="Variability Index"
                        value={analytics.variabilityIndex.toFixed(2)}
                      />
                    )}
                    {analytics.efficiencyFactor && (
                      <MetricRow
                        label="Efficiency Factor"
                        value={analytics.efficiencyFactor.toFixed(2)}
                      />
                    )}
                    {analytics.adherenceScore != null && (
                      <MetricRow
                        label="Plan Adherence"
                        value={`${Math.round(analytics.adherenceScore * 100)}%`}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Collapsible: Full Details */}
              {(hasPower || hasHeartRate || hasSpeed || hasElevation) && (
                <View className="space-y-3">
                  <Button
                    variant="outline"
                    onPress={() => setShowDetails(!showDetails)}
                    className="flex-row items-center justify-center gap-2"
                  >
                    <Text className="text-base font-medium">
                      {showDetails ? "Hide" : "View"} Detailed Charts
                    </Text>
                    <Icon
                      as={showDetails ? ChevronUp : ChevronDown}
                      size={20}
                      className="text-foreground"
                    />
                  </Button>

                  {showDetails && (
                    <View className="space-y-4">
                      {/* Multi-Metric Chart */}
                      {(hasPower || hasHeartRate || hasSpeed) && (
                        <MultiMetricChart
                          activityType={submission.activity.type as any}
                          streams={streams}
                          height={300}
                        />
                      )}

                      {/* Elevation Profile */}
                      {hasElevation && elevationStreamData && (
                        <ElevationProfileChart
                          elevationStream={elevationStreamData}
                          distanceStream={distanceStream}
                          height={200}
                          showStats={true}
                        />
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Notes{" "}
                      <Text className="text-muted-foreground text-sm font-normal">
                        (Optional)
                      </Text>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add notes about your activity..."
                        value={field.value || ""}
                        onChangeText={field.onChange}
                        numberOfLines={4}
                        className="min-h-28"
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </View>
          </Form>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const MetricRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-center justify-between">
    <Text className="text-sm text-muted-foreground font-medium">{label}</Text>
    <Text className="text-sm font-semibold">{value}</Text>
  </View>
);

const hasAnalytics = (activity: any) => {
  const metrics = activity.metrics as ActivityMetrics;
  return (
    metrics?.tss ||
    metrics?.intensity_factor ||
    metrics?.if ||
    metrics?.variability_index ||
    metrics?.vi ||
    metrics?.efficiency_factor ||
    metrics?.ef ||
    metrics?.adherence_score != null
  );
};

export default function SubmitScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SubmitScreen />
    </ErrorBoundary>
  );
}
