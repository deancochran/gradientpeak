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
import { useActivityRecorderData } from "@/lib/hooks/useActivityRecorder";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { eq } from "drizzle-orm";
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
import { z } from "zod";

const activityFormSchema = z.object({
  name: z.string().min(1, "Activity name is required"),
  notes: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activityFormSchema>;

export default function SubmitRecordingModal() {
  const router = useRouter();
  const { profile } = useRequireAuth();

  const service = useSharedActivityRecorder();
  const { recordingId } = useActivityRecorderData(service);
  const submission = useActivitySubmission(service);

  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: submission.activity?.name || "",
      notes: submission.activity?.notes || "",
    },
  });

  const handleSubmit = async (data: ActivityFormData) => {
    submission.update(data);
    await submission.submit();
    if (service) {
      await service.cleanup();
    }
    router.push("/(internal)/(tabs)/" as any);
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
            if (recordingId) {
              await localdb
                .delete(activityRecordings)
                .where(eq(activityRecordings.id, recordingId));
            }
            if (service) {
              await service.cleanup();
            }
            router.push("/(internal)/(tabs)/" as any);
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
                    {submission.activity.training_stress_score && (
                      <MetricRow
                        label="Training Stress Score"
                        value={Math.round(
                          submission.activity.training_stress_score,
                        ).toString()}
                      />
                    )}
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
                    {submission.activity.efficiency_factor && (
                      <MetricRow
                        label="Efficiency Factor"
                        value={submission.activity.efficiency_factor.toFixed(2)}
                      />
                    )}
                    {submission.activity.adherence_score != null && (
                      <MetricRow
                        label="Plan Adherence"
                        value={`${Math.round(submission.activity.adherence_score * 100)}%`}
                      />
                    )}
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

const hasAnalytics = (activity: any) =>
  activity.training_stress_score ||
  activity.intensity_factor ||
  activity.variability_index ||
  activity.efficiency_factor ||
  activity.adherence_score != null;
