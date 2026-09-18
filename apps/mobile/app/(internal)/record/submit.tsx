import {
  type ActivitySubmissionFormData,
  activitySubmissionFormSchema,
  type ContentVisibility,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Form, FormSegmentedSelectField, FormTextareaField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import { Save, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { RecordingReviewSummary } from "@/components/recording/RecordingReviewSummary";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";
import { useActivityRecorderService } from "@/lib/providers/ActivityRecorderProvider";

function SubmissionContent({ onRetryLoad }: { onRetryLoad: () => void }) {
  const router = useRouter();
  const [discardError, setDiscardError] = useState<string | null>(null);

  const { service } = useActivityRecorderService();
  const loadedSubmission = useActivitySubmission(service);
  const { profile } = useAuth();
  const wrongOwner = Boolean(
    loadedSubmission.artifact && loadedSubmission.artifact.profileId !== profile?.id,
  );
  const submission = wrongOwner ? { ...loadedSubmission, activity: null } : loadedSubmission;
  const identity = `${profile?.id ?? ""}:${submission.artifact?.sessionId ?? ""}`;
  const owner = useRef({ identity, active: true });
  if (owner.current.identity !== identity) owner.current = { identity, active: true };
  const draftIdentity = useRef<string | null>(null);
  const busy = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const renderOwner = owner.current;
  useEffect(() => {
    const current = renderOwner;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, [renderOwner]);

  const form = useZodForm<typeof activitySubmissionFormSchema>({
    schema: activitySubmissionFormSchema,
    defaultValues: {
      name: "Activity",
      notes: submission.activity?.notes ?? null,
      content_visibility: undefined,
    } as ActivitySubmissionFormData,
  });
  // RHF needs the dirty-field subscription to retain edited values during refresh.
  const { dirtyFields, isDirty } = form.formState;
  void dirtyFields;
  const navigationGuard = useDirtyNavigationGuard({
    isDirty,
    isPending: isBusy || submission.isSubmitting || form.formState.isSubmitting,
  });

  useEffect(() => {
    const sameIdentity = draftIdentity.current === identity;
    if (!submission.activity && sameIdentity) return;
    form.reset(
      {
        name: "Activity",
        notes: submission.activity?.notes ?? null,
        content_visibility: submission.activity?.content_visibility,
      },
      { keepDirtyValues: sameIdentity },
    );
    draftIdentity.current = identity;
  }, [form, identity, submission.activity]);

  // Memoize handlers to prevent re-renders
  const handleSubmit = useCallback(
    async (data: ActivitySubmissionFormData) => {
      if (
        busy.current ||
        submission.isSubmitting ||
        wrongOwner ||
        owner.current !== renderOwner ||
        !renderOwner.active
      )
        return;
      busy.current = true;
      setIsBusy(true);
      const current = owner.current;
      try {
        // Pass all form data to submission.update
        submission.update({
          name: submission.activity?.name || "Activity",
          notes: data.notes ?? null,
          content_visibility: data.content_visibility,
        });
        const success = await submission.submit({
          name: submission.activity?.name || "Activity",
          notes: data.notes ?? null,
          content_visibility: data.content_visibility,
        });
        if (!success || !current.active || owner.current !== current) {
          return;
        }
        if (service) {
          await service.cleanup();
        }
        if (!current.active || owner.current !== current) return;
        navigationGuard.allowNavigationAfterSuccess();
        router.replace("/(internal)/(tabs)");
      } finally {
        busy.current = false;
        setIsBusy(false);
      }
    },
    [submission, service, router, navigationGuard, wrongOwner, renderOwner],
  );

  const handleDiscard = useCallback(() => {
    if (
      busy.current ||
      submission.isSubmitting ||
      wrongOwner ||
      owner.current !== renderOwner ||
      !renderOwner.active
    )
      return;
    const current = owner.current;
    Alert.alert("Discard Activity", "Are you sure you want to delete this activity?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (
            busy.current ||
            submission.isSubmitting ||
            !current.active ||
            owner.current !== current
          )
            return;
          busy.current = true;
          setIsBusy(true);
          try {
            setDiscardError(null);
            if (service) {
              await service.discardFinalizedArtifact();
              await service.cleanup();
            }
            if (!current.active || owner.current !== current) return;
            navigationGuard.allowNavigationAfterSuccess();
            router.replace("/(internal)/(tabs)");
          } catch {
            if (!current.active || owner.current !== current) return;
            setDiscardError("Unable to discard this activity. Please try again.");
          } finally {
            busy.current = false;
            setIsBusy(false);
          }
        },
      },
    ]);
  }, [service, router, submission.isSubmitting, navigationGuard, wrongOwner, renderOwner]);

  const retryAllowed =
    !submission.isError || !submission.ingestionId || submission.canRetryIngestion;
  const canSubmit =
    Boolean(submission.artifact && submission.activity) &&
    !submission.isSubmitting &&
    !isBusy &&
    retryAllowed;

  const submitForm = useZodFormSubmit<ActivitySubmissionFormData>({
    form,
    onSubmit: handleSubmit,
    submittingLabel: "Saving...",
  });
  const submitButtonState = submitForm.getSubmitButtonState({
    disabled: !canSubmit,
    label: submission.isError && submission.canRetryIngestion ? "Retry upload" : "Save Activity",
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
              {submission.artifact ? (
                <RecordingReviewSummary
                  activityCategory={submission.activity.activityCategory}
                  calories={submission.activity.calories}
                  distanceMeters={submission.activity.distanceMeters}
                  durationSeconds={submission.activity.durationSeconds}
                  laps={submission.artifact.finalStats?.manualLapsMs ?? []}
                  movingSeconds={submission.activity.movingSeconds}
                />
              ) : null}
              {discardError || submission.statusMessage ? (
                <Text
                  className={
                    discardError || submission.isError
                      ? "text-sm text-destructive"
                      : "text-sm text-muted-foreground"
                  }
                  testID="activity-submit-status"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {discardError || submission.statusMessage}
                </Text>
              ) : null}

              <FormTextareaField
                control={form.control}
                description="Add notes about how the activity felt (optional)"
                disabled={submission.isSubmitting || isBusy}
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
                description="Use Default to inherit your profile setting, or choose an explicit visibility."
                disabled={submission.isSubmitting || isBusy}
                formatValue={(value) => value ?? "default"}
                label="Visibility"
                name="content_visibility"
                options={[
                  { label: "Default", value: "default" },
                  { label: "Private", value: "private" },
                  { label: "Followers", value: "followers" },
                  { label: "Public", value: "public" },
                ]}
                parseValue={(value: string) =>
                  value === "default" ? undefined : (value as ContentVisibility)
                }
                testId="activity-visibility-select"
              />

              {/* Delete Button */}
              <Button
                variant="destructive"
                onPress={handleDiscard}
                disabled={submission.isSubmitting || isBusy}
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
          <View className="gap-4 px-6 pt-10" testID="activity-submit-load-recovery">
            <Text className="text-base text-muted-foreground">
              {submission.isLoading
                ? "Loading finalized activity..."
                : discardError ||
                  (wrongOwner
                    ? "This recording belongs to another account. Sign in to that account to continue recovery."
                    : "No finalized activity found.")}
            </Text>
            {!submission.isLoading ? (
              <>
                <Button onPress={onRetryLoad} variant="outline" testID="activity-submit-retry-load">
                  <Text>Retry loading</Text>
                </Button>
                <Button
                  onPress={handleDiscard}
                  disabled={wrongOwner || isBusy || submission.isSubmitting}
                  variant="destructive"
                  testID="activity-submit-discard-exit"
                >
                  <Text className="text-destructive-foreground">Discard and exit</Text>
                </Button>
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      {submission.activity && submission.artifact ? (
        <View
          className="absolute bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 pb-8"
          testID="activity-submit-save-bar"
        >
          <LoadingButton
            testID="activity-submit-save-button"
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
      ) : null}
    </KeyboardAvoidingView>
  );
}

function SubmitScreen() {
  const [retryKey, setRetryKey] = useState(0);
  return <SubmissionContent key={retryKey} onRetryLoad={() => setRetryKey((value) => value + 1)} />;
}

export default function SubmitScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SubmitScreen />
    </ErrorBoundary>
  );
}
