import { type ActivitySubmissionFormData, activitySubmissionFormSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormSegmentedSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import { Save, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import {
  clearPendingFinalizedArtifact,
  deleteFinalizedArtifactFiles,
} from "@/lib/services/ActivityRecorder/finalizedArtifactStorage";

function SubmitScreen() {
  const router = useRouter();

  const service = useSharedActivityRecorder();
  const submission = useActivitySubmission(service);

  const form = useZodForm<typeof activitySubmissionFormSchema>({
    schema: activitySubmissionFormSchema,
    defaultValues: {
      name: submission.activity?.name || "",
      notes: submission.activity?.notes ?? null,
      is_private: false,
    } as ActivitySubmissionFormData,
  });

  useEffect(() => {
    if (!submission.activity) {
      return;
    }

    form.reset({
      name: submission.activity.name || "",
      notes: submission.activity.notes ?? null,
      is_private: false,
    });
  }, [form, submission.activity]);

  // Memoize handlers to prevent re-renders
  const handleSubmit = useCallback(
    async (data: ActivitySubmissionFormData) => {
      // Pass all form data to submission.update
      submission.update({
        name: data.name,
        notes: data.notes ?? undefined,
        is_private: data.is_private,
      });
      const success = await submission.submit({
        name: data.name,
        notes: data.notes ?? undefined,
        is_private: data.is_private,
      });
      if (!success) {
        return;
      }
      if (service) {
        await service.cleanup();
      }
      router.replace("/(internal)/(tabs)" as any);
    },
    [submission, service, router],
  );

  const handleDiscard = useCallback(() => {
    Alert.alert("Discard Activity", "Are you sure you want to delete this activity?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // Clean up stream files
          await clearPendingFinalizedArtifact();
          await deleteFinalizedArtifactFiles(submission.artifact);

          if (service) {
            await service.cleanup();
          }
          router.replace("/(internal)/(tabs)" as any);
        },
      },
    ]);
  }, [service, router, submission.artifact]);

  // Memoize canSubmit to prevent unnecessary re-renders
  const activityName = String(form.watch("name") ?? "");
  const canSubmit = useMemo(
    () =>
      Boolean(submission.artifact && submission.activity) &&
      activityName.trim().length > 0 &&
      !submission.isSubmitting,
    [activityName, submission.activity, submission.artifact, submission.isSubmitting],
  );

  const submitForm = useZodFormSubmit<ActivitySubmissionFormData>({
    form,
    onSubmit: handleSubmit,
    submittingLabel: "Saving...",
  });
  const submitButtonState = submitForm.getSubmitButtonState({
    disabled: !canSubmit,
    label: "Save Activity",
    submittingLabel: "Saving...",
  });

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="bg-background border-b border-border px-6 py-4 pt-14">
        <View className="flex-1 items-center mb-4">
          <Text className="text-2xl font-bold">Save Activity</Text>
          <Text className="text-sm text-muted-foreground">Add details for your activity</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-32"
      >
        {submission.activity ? (
          <Form {...form}>
            <View className="px-6 pt-6 space-y-6">
              {submission.statusMessage ? (
                <Text
                  className={
                    submission.isError
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                  testID="activity-submit-status"
                >
                  {submission.statusMessage}
                </Text>
              ) : null}

              <FormTextField
                control={form.control}
                disabled={submission.isSubmitting}
                label="Activity Name"
                name="name"
                placeholder="Enter activity name"
                testId="activity-name-input"
                className="text-base py-3"
              />

              <FormTextareaField
                control={form.control}
                description="Add notes about how the activity felt (optional)"
                disabled={submission.isSubmitting}
                formatValue={(value) => value ?? ""}
                label="Description"
                name="notes"
                numberOfLines={6}
                parseValue={(value) => value || null}
                placeholder="How did it feel? Any observations?"
                testId="activity-notes-input"
                className="min-h-32"
              />

              <FormSegmentedSelectField
                control={form.control}
                description="Choose whether this activity is only visible to you or visible on your profile."
                disabled={submission.isSubmitting}
                formatValue={(value) => (value ? "private" : "public")}
                label="Visibility"
                name="is_private"
                options={[
                  { label: "Visible on profile", value: "public" },
                  { label: "Private activity", value: "private" },
                ]}
                parseValue={(value: string) => value === "private"}
                testId="activity-visibility-select"
              />

              {/* Delete Button */}
              <Button
                variant="destructive"
                onPress={handleDiscard}
                disabled={submission.isSubmitting}
                className="w-full mt-8"
              >
                <View className="flex-row items-center gap-2">
                  <Icon as={Trash2} size={20} className="text-destructive-foreground" />
                  <Text className="text-base font-semibold text-destructive-foreground">
                    Delete Activity
                  </Text>
                </View>
              </Button>
            </View>
          </Form>
        ) : (
          <View className="px-6 pt-10">
            <Text className="text-base text-muted-foreground">
              {submission.isLoading
                ? "Loading finalized activity..."
                : submission.error || "No finalized activity found."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky Save Button at Bottom */}
      <View className="absolute bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 pb-8">
        <LoadingButton
          onPress={submitForm.handleSubmit}
          disabled={submitButtonState.disabled}
          loading={submission.isSubmitting || submitButtonState.loading}
          loadingLabel={submitButtonState.loadingLabel}
          className="w-full"
          size="lg"
        >
          <View className="flex-row items-center gap-2">
            <Icon as={Save} size={20} className="text-primary-foreground" />
            <Text className="text-base font-semibold text-primary-foreground">
              {submitButtonState.label}
            </Text>
          </View>
        </LoadingButton>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function SubmitScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SubmitScreen />
    </ErrorBoundary>
  );
}
