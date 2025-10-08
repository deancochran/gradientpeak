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
import { localdb } from "@/lib/db";
import { activityRecordings } from "@/lib/db/schemas";
import {
  useActivityRecorderData,
  usePlan,
  useRecordingState,
} from "@/lib/hooks/useActivityRecorder";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPower,
  formatSpeed,
} from "@repo/core";
import { eq } from "drizzle-orm";
import { useRouter } from "expo-router";
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
import { useCallback, useEffect, useState } from "react";
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
  const router = useRouter();
  const { profile } = useRequireAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Get shared service from context
  const service = useSharedActivityRecorder();
  const recordingState = useRecordingState(service);
  const { recordingId, stats } = useActivityRecorderData(service);
  const plan = usePlan(service);
  const plannedActivityId = service?.plannedActivityId;

  // Use simplified submission hook
  const submission = useActivitySubmission(service);

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  // Check if recording exists and finish it if needed
  useEffect(() => {
    if (!service?.recording) {
      Alert.alert(
        "No Recording",
        "No active recording found. Please try again.",
        [
          {
            text: "Go Back",
            onPress: () => router.back(),
          },
        ],
      );
      return;
    }

    // If not finished yet, finish the recording now
    if (recordingState !== "finished" && !isFinishing) {
      setIsFinishing(true);
      console.log("[SubmitRecordingModal] Finishing recording...");

      service
        .finishRecording()
        .then(() => {
          console.log("[SubmitRecordingModal] Recording finished successfully");
          setIsFinishing(false);
        })
        .catch((error) => {
          console.error(
            "[SubmitRecordingModal] Failed to finish recording:",
            error,
          );
          setErrorMessage("Failed to finish recording. Please try again.");
          setIsFinishing(false);
        });
    } else if (recordingState === "finished") {
      setIsFinishing(false);
    }
  }, [recordingState, service, router, isFinishing]);

  // Set form values when activity is ready
  useEffect(() => {
    if (submission.activity) {
      form.setValue("name", submission.activity.name || "");
      form.setValue("notes", submission.activity.notes || "");
    }
  }, [submission.activity, form]);

  // Show error toast
  useEffect(() => {
    if (submission.error) {
      setErrorMessage(submission.error);
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [submission.error]);

  // Navigate home helper
  const navigateToHome = useCallback(async () => {
    if (service) {
      await service.cleanup();
    }
    router.push("/(internal)/(tabs)/" as any);
  }, [router, service]);

  // Auto-close after successful submission
  useEffect(() => {
    if (submission.isSuccess) {
      const timer = setTimeout(() => {
        navigateToHome();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [submission.isSuccess, navigateToHome]);

  const handleSubmit = async (data: ActivityFormData) => {
    setErrorMessage(null);
    submission.update(data);
    try {
      await submission.submit();
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
          onPress: async () => {
            if (!recordingId) return;

            try {
              await localdb
                .delete(activityRecordings)
                .where(eq(activityRecordings.id, recordingId));

              console.log(
                "[SubmitRecordingModal] Recording deleted:",
                recordingId,
              );
              await navigateToHome();
            } catch (error) {
              console.error(
                "[SubmitRecordingModal] Failed to delete recording:",
                error,
              );
              setErrorMessage("Failed to delete recording. Please try again.");
            }
          },
        },
      ],
    );
  };

  const canSubmit =
    submission.isReady &&
    !submission.isUploading &&
    !submission.isSuccess &&
    !isFinishing &&
    recordingState === "finished" &&
    form.formState.isValid;

  const canDelete =
    !submission.isLoading &&
    !submission.isUploading &&
    !submission.isSuccess &&
    !isFinishing &&
    recordingState === "finished";

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Loading overlay while finishing or processing */}
      {(isFinishing || submission.isLoading) && (
        <View className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
          <View className="items-center space-y-4">
            <Icon
              as={Loader2}
              size={48}
              className="animate-spin text-primary"
            />
            <Text className="text-lg font-medium text-foreground">
              {isFinishing
                ? "Finishing recording..."
                : "Processing activity data..."}
            </Text>
            {submission.error && (
              <Text className="text-sm text-destructive px-4 text-center">
                {submission.error}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Header */}
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
            {submission.isUploading ? (
              <Icon
                as={Loader2}
                size={18}
                className="animate-spin text-primary"
              />
            ) : submission.isSuccess ? (
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
        </View>
      )}

      {/* Success Banner */}
      {submission.isSuccess && (
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
        {/* Finishing Activity State */}
        {isFinishing && (
          <View className="items-center justify-center py-16 px-6">
            <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-6">
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
            <Text className="text-base font-semibold mb-2">
              Finishing Activity...
            </Text>
            <Text className="text-sm text-muted-foreground text-center">
              Processing final data and calculations
            </Text>
          </View>
        )}

        {/* Loading/Processing State */}
        {!isFinishing && submission.isLoading && (
          <View className="items-center justify-center py-16 px-6">
            <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-6">
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
            <Text className="text-base font-semibold mb-2">
              Processing Activity...
            </Text>
            <Text className="text-sm text-muted-foreground text-center">
              Aggregating streams and computing metrics
            </Text>
          </View>
        )}

        {/* Error State */}
        {!isFinishing && submission.isError && (
          <View className="items-center justify-center py-16 px-6">
            <View className="w-20 h-20 bg-red-500/10 rounded-full items-center justify-center mb-6">
              <Icon as={Activity} size={32} className="text-red-500" />
            </View>
            <Text className="text-base font-semibold mb-2 text-red-600">
              Processing Failed
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              {submission.error}
            </Text>
            <Button variant="outline" onPress={() => router.back()}>
              <Text>Go Back</Text>
            </Button>
          </View>
        )}

        {/* Ready State - Activity Content */}
        {!isFinishing && submission.isReady && submission.activity && (
          <Form {...form}>
            <View className="px-6 pt-6 space-y-6">
              {/* Activity Metrics Summary */}
              <View className="space-y-4">
                <Text className="text-lg font-semibold">Activity Summary</Text>

                <View className="bg-muted/30 rounded-xl p-4">
                  <View className="space-y-3">
                    <MetricRow
                      icon={Clock}
                      label="Duration"
                      value={formatDuration(
                        submission.activity.elapsed_time || stats.duration,
                      )}
                    />
                    <MetricRow
                      icon={Activity}
                      label="Moving Time"
                      value={formatDuration(
                        submission.activity.moving_time || stats.movingTime,
                      )}
                    />
                    {(submission.activity.distance || stats.distance) > 0 && (
                      <MetricRow
                        icon={Activity}
                        label="Distance"
                        value={formatDistance(
                          submission.activity.distance || stats.distance,
                        )}
                      />
                    )}
                    {(submission.activity.avg_speed || stats.avgSpeed) > 0 && (
                      <MetricRow
                        icon={Activity}
                        label="Avg Speed"
                        value={formatSpeed(
                          submission.activity.avg_speed || stats.avgSpeed,
                        )}
                      />
                    )}
                    {(submission.activity.avg_heart_rate ||
                      stats.avgHeartRate) > 0 && (
                      <MetricRow
                        icon={Heart}
                        label="Avg Heart Rate"
                        value={formatHeartRate(
                          submission.activity.avg_heart_rate ||
                            stats.avgHeartRate,
                        )}
                      />
                    )}
                    {(submission.activity.avg_power || stats.avgPower) > 0 && (
                      <MetricRow
                        icon={Zap}
                        label="Avg Power"
                        value={formatPower(
                          submission.activity.avg_power || stats.avgPower,
                        )}
                      />
                    )}
                    {(submission.activity.total_ascent || stats.ascent) > 0 && (
                      <MetricRow
                        icon={Mountain}
                        label="Elevation Gain"
                        value={`${Math.round(submission.activity.total_ascent || stats.ascent)}m`}
                      />
                    )}
                    {stats.calories > 0 && (
                      <MetricRow
                        icon={Activity}
                        label="Calories"
                        value={`${Math.round(stats.calories)} kcal`}
                      />
                    )}

                    {/* Plan-specific metrics */}
                    {(submission.activity.planned_activity_id ||
                      submission.activity.adherence_score != null ||
                      plan.hasPlan) && (
                      <>
                        <View className="border-t border-muted-foreground/20 my-2" />
                        <Text className="text-xs text-muted-foreground uppercase tracking-wide">
                          {submission.activity.planned_activity_id
                            ? "Planned Activity"
                            : plannedActivityId
                              ? "Planned Activity"
                              : plan.hasPlan
                                ? "Template Workout"
                                : "Workout Plan"}
                        </Text>

                        {plan.hasPlan && plan.name && (
                          <MetricRow label="Workout" value={plan.name} />
                        )}

                        {submission.activity.adherence_score != null && (
                          <MetricRow
                            label="Plan Adherence"
                            value={`${Math.round(submission.activity.adherence_score * 100)}%`}
                          />
                        )}
                      </>
                    )}

                    {/* Advanced metrics */}
                    {(submission.activity.normalized_power ||
                      submission.activity.intensity_factor ||
                      submission.activity.training_stress_score) && (
                      <>
                        <View className="border-t border-muted-foreground/20 my-2" />
                        <Text className="text-xs text-muted-foreground uppercase tracking-wide">
                          Performance Metrics
                        </Text>
                        {submission.activity.normalized_power && (
                          <MetricRow
                            label="Normalized Power"
                            value={formatPower(
                              submission.activity.normalized_power,
                            )}
                          />
                        )}
                        {submission.activity.intensity_factor && (
                          <MetricRow
                            label="Intensity Factor"
                            value={submission.activity.intensity_factor.toFixed(
                              2,
                            )}
                          />
                        )}
                        {submission.activity.training_stress_score && (
                          <MetricRow
                            label="TSS"
                            value={Math.round(
                              submission.activity.training_stress_score,
                            ).toString()}
                          />
                        )}
                        {submission.activity.variability_index && (
                          <MetricRow
                            label="Variability Index"
                            value={submission.activity.variability_index.toFixed(
                              2,
                            )}
                          />
                        )}
                      </>
                    )}
                  </View>
                </View>
              </View>

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
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Activity Details */}
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
                        submission.activity.started_at,
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
                      {new Date(
                        submission.activity.started_at,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
                      {submission.activity.activity_type?.replace(/_/g, " ")}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Primary Metrics Grid */}
              <View className="space-y-4">
                <Text className="text-base font-semibold">Primary Metrics</Text>
                <View className="grid grid-cols-2 gap-3">
                  <View className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                    <Icon as={Clock} size={20} className="text-primary mb-2" />
                    <Text className="text-xs text-muted-foreground mb-1">
                      Duration
                    </Text>
                    <Text className="text-xl font-bold">
                      {submission.activity.elapsed_time
                        ? formatDuration(
                            submission.activity.elapsed_time / 1000,
                          )
                        : "--"}
                    </Text>
                  </View>

                  {submission.activity.distance > 0 && (
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
                        {formatDistance(submission.activity.distance)}
                      </Text>
                    </View>
                  )}

                  {submission.activity.avg_speed && (
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
                        {formatSpeed(submission.activity.avg_speed)}
                      </Text>
                    </View>
                  )}

                  {submission.activity.avg_heart_rate && (
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
                        {formatHeartRate(submission.activity.avg_heart_rate)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Additional Metrics */}
              {(submission.activity.avg_power ||
                submission.activity.max_heart_rate ||
                submission.activity.max_speed) && (
                <View className="space-y-4">
                  <Text className="text-base font-semibold">
                    Additional Metrics
                  </Text>
                  <View className="bg-card rounded-xl border p-4 space-y-3">
                    {submission.activity.avg_power && (
                      <MetricRow
                        label="Average Power"
                        value={formatPower(submission.activity.avg_power)}
                      />
                    )}
                    {submission.activity.max_power && (
                      <MetricRow
                        label="Max Power"
                        value={formatPower(submission.activity.max_power)}
                      />
                    )}
                    {submission.activity.max_heart_rate && (
                      <MetricRow
                        label="Max Heart Rate"
                        value={formatHeartRate(
                          submission.activity.max_heart_rate,
                        )}
                      />
                    )}
                    {submission.activity.max_speed && (
                      <MetricRow
                        label="Max Speed"
                        value={formatSpeed(submission.activity.max_speed)}
                      />
                    )}
                    {submission.activity.total_ascent && (
                      <MetricRow
                        label="Total Elevation Gain"
                        value={`${submission.activity.total_ascent.toFixed(0)}m`}
                      />
                    )}
                    {submission.activity.total_descent && (
                      <MetricRow
                        label="Total Elevation Loss"
                        value={`${submission.activity.total_descent.toFixed(0)}m`}
                      />
                    )}
                    {submission.activity.decoupling && (
                      <MetricRow
                        label="Aerobic Decoupling"
                        value={`${(submission.activity.decoupling * 100).toFixed(1)}%`}
                      />
                    )}
                    {submission.activity.efficiency_factor && (
                      <MetricRow
                        label="Efficiency Factor"
                        value={submission.activity.efficiency_factor.toFixed(2)}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Advanced Metrics */}
              {(submission.activity.intensity_factor ||
                submission.activity.variability_index ||
                submission.activity.power_weight_ratio) && (
                <View className="space-y-4">
                  <Text className="text-base font-semibold">
                    Advanced Metrics
                  </Text>
                  <View className="bg-card rounded-xl border p-4 space-y-3">
                    {submission.activity.intensity_factor && (
                      <MetricRow
                        label="Intensity Factor"
                        value={submission.activity.intensity_factor.toFixed(2)}
                      />
                    )}
                    {submission.activity.variability_index && (
                      <MetricRow
                        label="Variability Index"
                        value={submission.activity.variability_index.toFixed(2)}
                      />
                    )}
                    {submission.activity.power_weight_ratio && (
                      <MetricRow
                        label="Power/Weight Ratio"
                        value={`${submission.activity.power_weight_ratio.toFixed(2)} W/kg`}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Editable Notes */}
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
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Upload Status */}
              {(submission.isUploading || submission.isSuccess) && (
                <View className="bg-muted/30 rounded-xl p-4 items-center">
                  {submission.isUploading && (
                    <>
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text className="text-sm font-medium mt-2">
                        Submitting Activity...
                      </Text>
                    </>
                  )}
                  {submission.isSuccess && (
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

const MetricRow = ({
  icon: IconComponent,
  label,
  value,
}: {
  icon?: any;
  label: string;
  value: string;
}) => (
  <View className="flex-row justify-between items-center">
    <View className="flex-row items-center gap-2">
      {IconComponent && (
        <Icon as={IconComponent} size={16} className="text-muted-foreground" />
      )}
      <Text className="text-sm text-muted-foreground">{label}</Text>
    </View>
    <Text className="text-sm font-semibold">{value}</Text>
  </View>
);
