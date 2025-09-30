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
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { useRequireAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { zodResolver } from "@hookform/resolvers/zod";
import { ActivitySummary } from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  RotateCcw,
  Send,
  X,
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

type SubmissionState =
  | "processing"
  | "summary"
  | "submitting"
  | "success"
  | "error";

// Create form schema based on the fields we want to edit
const activityFormSchema = z.object({
  name: z.string().min(1, "Activity name is required"),
  notes: z.string().optional(),
});

type ActivityFormData = z.infer<typeof activityFormSchema>;

export default function SubmitRecordingModal() {
  const { activityRecordingId } = useLocalSearchParams<{
    activityRecordingId: string;
  }>();
  const { profile } = useRequireAuth();
  const router = useRouter();
  const { uploadActivity } = useActivityRecorder();

  // State
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("processing");
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const service = ActivityRecorderService.getInstance();

  // Form management with react-hook-form
  const form = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  // Process activity data when modal opens
  useEffect(() => {
    if (!activityRecordingId || submissionState !== "processing") return;

    const processActivity = async () => {
      try {
        setProcessingProgress(25);

        // Compute activity summary from recorded data
        const summary = await service.computeActivitySummary();
        setActivitySummary(summary);
        setProcessingProgress(50);

        // Prepare form data with defaults
        const activityType = service.activityType.replace("_", " ");
        const defaultName = `${activityType.charAt(0).toUpperCase()}${activityType.slice(1)} Activity`;

        // Set form values
        form.setValue("name", defaultName);
        form.setValue("notes", "");
        setProcessingProgress(75);

        // Simulate processing completion
        setTimeout(() => {
          setProcessingProgress(100);
          setTimeout(() => {
            setSubmissionState("summary");
          }, 500);
        }, 1000);
      } catch (error) {
        console.error("Failed to process activity:", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to process activity data",
        );
        setSubmissionState("error");
      }
    };

    processActivity();
  }, [activityRecordingId, submissionState, service, form]);

  // Handle submit activity
  const handleSubmitActivity = useCallback(
    async (data: ActivityFormData) => {
      if (!activitySummary || !activityRecordingId) return;

      setSubmissionState("submitting");
      setErrorMessage(null);

      try {
        // Update activity name and description in service/storage if needed
        // This would be implemented in your storage manager
        console.log("Submitting activity with data:", data);

        // Upload activity
        const success = await uploadActivity(activityRecordingId);

        if (success) {
          setSubmissionState("success");

          // Auto-close after success
          setTimeout(() => {
            router.dismiss();
          }, 2000);
        } else {
          throw new Error("Upload failed");
        }
      } catch (error) {
        console.error("Failed to submit activity:", error);
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to submit activity",
        );
        setSubmissionState("error");
      }
    },
    [activitySummary, activityRecordingId, uploadActivity, router],
  );

  // Handle discard activity
  const handleDiscardActivity = useCallback(() => {
    Alert.alert(
      "Discard Activity",
      "Are you sure you want to delete this activity? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await service.discardRecording();
              router.dismiss();
            } catch (error) {
              console.error("Failed to discard activity:", error);
              Alert.alert("Error", "Failed to delete activity");
            }
          },
        },
      ],
    );
  }, [service, router]);

  // Handle retry processing
  const handleRetryProcessing = useCallback(() => {
    setSubmissionState("processing");
    setProcessingProgress(0);
    setErrorMessage(null);
  }, []);

  // Handle close modal
  const handleClose = useCallback(() => {
    if (submissionState === "processing" || submissionState === "submitting") {
      Alert.alert(
        "Processing Activity",
        "Please wait while we process your activity data.",
        [{ text: "OK" }],
      );
      return;
    }
    router.dismiss();
  }, [submissionState, router]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 pt-12">
        <View className="flex-row items-center justify-between">
          <Button size="icon" variant="ghost" onPress={handleClose}>
            <Icon as={ArrowLeft} size={24} />
          </Button>

          <View className="flex-1 items-center">
            <Text className="font-semibold text-lg">
              {submissionState === "processing" && "Processing Activity"}
              {submissionState === "summary" && "Activity Summary"}
              {submissionState === "submitting" && "Submitting..."}
              {submissionState === "success" && "Success!"}
              {submissionState === "error" && "Error"}
            </Text>
          </View>

          <View className="w-10" />
        </View>
      </View>

      {/* Body Content */}
      <View className="flex-1">
        {submissionState === "processing" && (
          <ProcessingView progress={processingProgress} />
        )}

        {submissionState === "summary" && activitySummary && (
          <SummaryView summary={activitySummary} form={form} />
        )}

        {submissionState === "submitting" && <SubmittingView />}

        {submissionState === "success" && <SuccessView />}

        {submissionState === "error" && (
          <ErrorView
            error={errorMessage || "Unknown error occurred"}
            onRetry={handleRetryProcessing}
          />
        )}
      </View>

      {/* Footer Actions */}
      <View className="bg-background border-t border-border p-6 pb-8">
        {submissionState === "summary" && (
          <View className="space-y-4">
            <Button
              onPress={form.handleSubmit(handleSubmitActivity)}
              className="w-full h-14 rounded-xl"
            >
              <Icon as={Send} size={24} />
              <Text className="ml-3 font-semibold text-lg">
                Submit Activity
              </Text>
            </Button>
            <Button
              onPress={handleDiscardActivity}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              <Icon as={RotateCcw} size={20} />
              <Text className="ml-2">Discard Activity</Text>
            </Button>
          </View>
        )}

        {submissionState === "error" && (
          <View className="space-y-4">
            <Button
              onPress={handleRetryProcessing}
              className="w-full h-14 rounded-xl"
            >
              <Icon as={RotateCcw} size={24} />
              <Text className="ml-3 font-semibold text-lg">Try Again</Text>
            </Button>
            <Button
              onPress={handleDiscardActivity}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              <Icon as={X} size={20} />
              <Text className="ml-2">Discard Activity</Text>
            </Button>
          </View>
        )}

        {submissionState === "success" && (
          <Button
            onPress={() => router.dismiss()}
            variant="outline"
            className="w-full h-12 rounded-xl"
          >
            <Text className="font-semibold">Close</Text>
          </Button>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Processing State View */
const ProcessingView = ({ progress }: { progress: number }) => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-32 h-32 bg-primary/10 rounded-full items-center justify-center mb-8">
      <ActivityIndicator size="large" color="#007AFF" />
    </View>

    <Text className="text-2xl font-bold mb-4">Processing Activity</Text>
    <Text className="text-center text-muted-foreground mb-8">
      Computing metrics from your recorded data...
    </Text>

    {/* Progress Bar */}
    <View className="w-full bg-gray-200 rounded-full h-3 mb-4">
      <View
        className="bg-primary h-3 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </View>

    <Text className="text-sm text-muted-foreground">{progress}% complete</Text>
  </View>
);

/** Summary & Edit State View */
const SummaryView = ({
  summary,
  form,
}: {
  summary: ActivitySummary;
  form: ReturnType<typeof useForm<ActivityFormData>>;
}) => (
  <Form {...form}>
    <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
      {/* Editable Fields */}
      <View className="mb-6">
        <Text className="text-lg font-semibold mb-4">Activity Details</Text>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="mb-4">
              <FormLabel>Activity Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter activity name"
                  value={field.value}
                  onChangeText={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="mb-6">
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes (optional)"
                  value={field.value || ""}
                  onChangeText={field.onChange}
                  numberOfLines={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </View>

      {/* Performance Summary */}
      <View>
        <Text className="text-lg font-semibold mb-4">Performance Summary</Text>

        {/* Primary Metrics */}
        <View className="flex-row mb-4 space-x-4">
          <View className="flex-1 bg-card rounded-xl p-4 border">
            <Text className="text-xs text-muted-foreground mb-1">Duration</Text>
            <Text className="text-2xl font-bold text-primary">
              {summary.duration
                ? formatDuration(summary.duration / 1000)
                : "--"}
            </Text>
          </View>

          <View className="flex-1 bg-card rounded-xl p-4 border">
            <Text className="text-xs text-muted-foreground mb-1">Distance</Text>
            <Text className="text-2xl font-bold text-blue-600">
              {summary.distance ? formatDistance(summary.distance) : "--"}
            </Text>
          </View>
        </View>

        {/* Secondary Metrics */}
        <View className="flex-row flex-wrap justify-between">
          {summary.averageSpeed && (
            <View className="w-[48%] bg-card rounded-xl p-3 border mb-3">
              <Text className="text-xs text-muted-foreground">Avg Speed</Text>
              <Text className="text-lg font-semibold mt-1">
                {formatSpeed(summary.averageSpeed)}
              </Text>
            </View>
          )}

          {summary.averageHeartRate && (
            <View className="w-[48%] bg-card rounded-xl p-3 border mb-3">
              <Text className="text-xs text-muted-foreground">Avg HR</Text>
              <Text className="text-lg font-semibold text-red-500 mt-1">
                {formatHeartRate(summary.averageHeartRate)}
              </Text>
            </View>
          )}

          {summary.averagePower && (
            <View className="w-[48%] bg-card rounded-xl p-3 border mb-3">
              <Text className="text-xs text-muted-foreground">Avg Power</Text>
              <Text className="text-lg font-semibold text-yellow-500 mt-1">
                {formatPower(summary.averagePower)}
              </Text>
            </View>
          )}

          {summary.calories && (
            <View className="w-[48%] bg-card rounded-xl p-3 border mb-3">
              <Text className="text-xs text-muted-foreground">Calories</Text>
              <Text className="text-lg font-semibold text-orange-500 mt-1">
                {Math.round(summary.calories)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  </Form>
);

/** Submitting State View */
const SubmittingView = () => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-32 h-32 bg-blue-50 rounded-full items-center justify-center mb-8">
      <Icon as={Loader2} size={48} className="text-blue-600 animate-spin" />
    </View>

    <Text className="text-2xl font-bold mb-4">Uploading Activity</Text>
    <Text className="text-center text-muted-foreground">
      Submitting your activity data to the server...
    </Text>
  </View>
);

/** Success State View */
const SuccessView = () => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-32 h-32 bg-green-50 rounded-full items-center justify-center mb-8">
      <Icon as={CheckCircle} size={48} className="text-green-600" />
    </View>

    <Text className="text-3xl font-bold text-green-600 mb-4">Success!</Text>
    <Text className="text-center text-muted-foreground text-lg">
      Your activity has been successfully uploaded and saved.
    </Text>

    <Text className="text-center text-muted-foreground text-sm mt-4">
      This modal will close automatically...
    </Text>
  </View>
);

/** Error State View */
const ErrorView = ({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) => (
  <View className="flex-1 items-center justify-center p-8">
    <View className="w-32 h-32 bg-red-50 rounded-full items-center justify-center mb-8">
      <Icon as={X} size={48} className="text-red-600" />
    </View>

    <Text className="text-2xl font-bold text-red-600 mb-4">
      Processing Failed
    </Text>
    <Text className="text-center text-muted-foreground mb-6">{error}</Text>
    <Text className="text-center text-muted-foreground text-sm">
      You can try processing again or discard this activity.
    </Text>
  </View>
);
