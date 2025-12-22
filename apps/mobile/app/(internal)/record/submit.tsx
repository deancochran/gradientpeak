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
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  activitySubmissionFormSchema,
  type ActivitySubmissionFormData,
} from "@repo/core";
import { useRouter } from "expo-router";
import { CheckCircle, Loader2, Send, Trash2 } from "lucide-react-native";
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
  [key: string]: unknown;
}

function SubmitScreen() {
  const router = useRouter();

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

  const handleSubmit = async (data: ActivitySubmissionFormData) => {
    // Only pass name and notes to submission.update
    submission.update({ name: data.name, notes: data.notes ?? undefined });
    await submission.submit();
    if (service) {
      await service.cleanup();
    }
    // Navigate back twice: once to close submit screen, once to close record modal
    router.back();
    router.back();
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
  };

  const canSubmit =
    form.watch("name")?.trim().length > 0 && !submission.isUploading;

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

              {/* Analytics */}
              {hasAnalytics(submission.activity) && (
                <View className="space-y-3">
                  <Text className="text-base font-semibold">Analytics</Text>
                  <View className="bg-card rounded-2xl border p-4 space-y-3">
                    {(() => {
                      const metrics = submission.activity
                        .metrics as ActivityMetrics;
                      return (
                        <>
                          {metrics?.tss && (
                            <MetricRow
                              label="Training Stress Score"
                              value={Math.round(metrics.tss).toString()}
                            />
                          )}
                          {(metrics?.intensity_factor ?? metrics?.if) && (
                            <MetricRow
                              label="Intensity Factor"
                              value={(
                                metrics.intensity_factor ??
                                metrics.if ??
                                0
                              ).toFixed(2)}
                            />
                          )}
                          {(metrics?.variability_index ?? metrics?.vi) && (
                            <MetricRow
                              label="Variability Index"
                              value={(
                                metrics.variability_index ??
                                metrics.vi ??
                                0
                              ).toFixed(2)}
                            />
                          )}
                          {(metrics?.efficiency_factor ?? metrics?.ef) && (
                            <MetricRow
                              label="Efficiency Factor"
                              value={(
                                metrics.efficiency_factor ??
                                metrics.ef ??
                                0
                              ).toFixed(2)}
                            />
                          )}
                          {metrics?.adherence_score != null && (
                            <MetricRow
                              label="Plan Adherence"
                              value={`${Math.round(metrics.adherence_score * 100)}%`}
                            />
                          )}
                        </>
                      );
                    })()}
                  </View>
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
