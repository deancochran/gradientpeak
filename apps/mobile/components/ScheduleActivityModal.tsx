/**
 * ScheduleActivityModal - Simplified Activity Scheduling Component
 *
 * ## Purpose
 * A focused modal for scheduling a specific activity plan. The plan must be
 * pre-selected before opening this modal, keeping the UX simple and focused.
 *
 * ## Design Philosophy
 * - User browses plans first (discover, detail page, etc.)
 * - User clicks "Schedule" with a specific plan in mind
 * - Modal opens with only date and notes to configure
 * - Much simpler and faster than full-page form
 *
 * ## Features
 * - Pre-selected activity plan (required)
 * - Date picker with formatted display
 * - Optional notes field
 * - Edit mode support
 * - Loading states and error handling
 *
 * ## Usage Examples
 *
 * ### Schedule from Discover/Detail Page
 * ```tsx
 * const [showModal, setShowModal] = useState(false);
 * const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
 *
 * <Button onPress={() => {
 *   setSelectedPlan(plan.id);
 *   setShowModal(true);
 * }}>
 *   Schedule
 * </Button>
 *
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   activityPlanId={selectedPlan!}
 *   onSuccess={() => refetch()}
 * />
 * ```
 *
 * ### Schedule with Pre-selected Date (from calendar)
 * ```tsx
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   activityPlanId={planId}
 *   preselectedDate={selectedDate}
 * />
 * ```
 *
 * ### Edit Existing Schedule
 * ```tsx
 * <ScheduleActivityModal
 *   visible={showModal}
 *   onClose={() => setShowModal(false)}
 *   eventId={activityId}
 * />
 * ```
 *
 */

import { buildDirectPlannedSessionCreateInput } from "@repo/api/client";
import type { ActivityPlanDetail, ActivityPlanSummary } from "@repo/core";
import { THEME } from "@repo/tailwindcss/native";
import { Button } from "@repo/ui/components/button";
import { Form, FormDateInputField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { api } from "@/lib/api";
import { useDirtyCloseGuard } from "@/lib/hooks/useDirtyCloseGuard";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";
import { applyServerFormErrors, getErrorMessage } from "@/lib/utils/formErrors";

const scheduleActivityModalFormSchema = z.object({
  activityPlanId: z.string().uuid("Please select an activity plan"),
  scheduledDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date format"),
});
type ScheduleActivityModalFormInput = z.input<typeof scheduleActivityModalFormSchema>;
type ScheduleActivityModalFormOutput = z.output<typeof scheduleActivityModalFormSchema>;

interface ScheduleActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;

  // Either provide activityPlanId (database ID), activityPlan (template object), or eventId (edit)
  activityPlanId?: string;
  activityPlan?: ActivityPlanSummary | ActivityPlanDetail;
  eventId?: string;

  // Optional pre-selected date
  preselectedDate?: string;
}

function toDateOnlyString(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

function setRootFormError(
  form: Partial<Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "setError">>,
  error: unknown,
  fallbackMessage: string,
) {
  if (
    form.setError &&
    applyServerFormErrors(
      form as Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "setError">,
      error,
    )
  ) {
    return;
  }

  form.setError?.("root", {
    type: "server",
    message: getErrorMessage(error) || fallbackMessage,
  });
}

function clearRootFormError(
  form: Partial<Pick<UseFormReturn<ScheduleActivityModalFormOutput>, "clearErrors">>,
) {
  form.clearErrors?.("root");
}

async function runMutation<TInput, TResult>(
  mutation: {
    mutateAsync?: (input: TInput) => Promise<TResult>;
    mutate?: (input: TInput) => void;
  },
  input: TInput,
): Promise<TResult | undefined> {
  if (mutation.mutateAsync) {
    return await mutation.mutateAsync(input);
  }

  if (mutation.mutate) {
    mutation.mutate(input);
    return;
  }

  throw new Error("Mutation is unavailable");
}

export function ScheduleActivityModal({
  visible,
  onClose,
  onSuccess,
  activityPlanId,
  activityPlan,
  eventId,
  preselectedDate,
}: ScheduleActivityModalProps) {
  const { resolvedTheme } = useTheme();
  const isEditMode = !!eventId;
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const operationId = useRef(randomUUID());
  const resolvedActivityPlanId = activityPlanId ?? activityPlan?.id ?? "";
  const isTemplate = !!activityPlan && !activityPlanId;

  const form = useZodForm<
    ScheduleActivityModalFormInput,
    undefined,
    ScheduleActivityModalFormOutput
  >({
    schema: scheduleActivityModalFormSchema,
    defaultValues: {
      scheduledDate: preselectedDate || toDateOnlyString(new Date()),
      activityPlanId: resolvedActivityPlanId,
    },
  });

  const currentActivityPlanId = form.watch("activityPlanId");

  // Fetch plan details (only if we have an ID, not a template)
  const { data: planDetails, isLoading: loadingPlan } = api.activityPlans.getById.useQuery(
    { id: currentActivityPlanId },
    { enabled: !!currentActivityPlanId && visible && !isTemplate },
  );

  // Use template if provided, otherwise use fetched plan.
  const displayPlan = isTemplate ? activityPlan : planDetails?.detail;
  const selectedPlanIsExecutable = Boolean(displayPlan?.capabilities.canSchedule);
  const existingPlanReadOnly = isEditMode;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!visible) {
      form.reset();
    }
  }, [visible, form]);

  useEffect(() => {
    if (!isEditMode && resolvedActivityPlanId) {
      form.setValue("activityPlanId", resolvedActivityPlanId, {
        shouldValidate: false,
      });
    }
  }, [isEditMode, resolvedActivityPlanId, form]);

  const queryClient = useQueryClient();

  const createMutation = api.plannedSessions.create.useMutation();

  const handleMutationSuccess = async () => {
    await refreshScheduleWithCallbacks({
      queryClient,
      callbacks: [],
    });
    onClose();
    await onSuccess?.();
  };

  const onSubmit = async (data: ScheduleActivityModalFormOutput) => {
    if (!profileId) {
      setRootFormError(form, new Error("Profile is still loading"), "Failed to schedule activity.");
      return;
    }
    if (!displayPlan) {
      setRootFormError(
        form,
        new Error("Activity plan is unavailable"),
        "Failed to schedule activity.",
      );
      return;
    }
    if (!selectedPlanIsExecutable) {
      setRootFormError(
        form,
        new Error("Only executable single-activity-category plans can be scheduled."),
        "Only executable single-activity-category plans can be scheduled.",
      );
      return;
    }

    clearRootFormError(form);

    try {
      await runMutation(
        createMutation,
        buildDirectPlannedSessionCreateInput({
          profileId,
          planningDate: data.scheduledDate,
          operationId: operationId.current,
          activityPlanId: data.activityPlanId,
        }),
      );

      await handleMutationSuccess();
    } catch (error) {
      setRootFormError(form, error, "Failed to schedule activity. Please try again.");
    }
  };

  const submitForm = useZodFormSubmit<ScheduleActivityModalFormOutput>({
    form,
    onSubmit,
  });

  const isSubmitting = submitForm.isSubmitting || createMutation.isPending;
  const requestClose = useDirtyCloseGuard({
    isDirty: form.formState.isDirty,
    isPending: isSubmitting,
  });
  const rootErrorMessage = form.formState?.errors.root?.message;
  const isLoading = loadingPlan && !isTemplate;
  const canSchedule =
    !isLoading &&
    displayPlan &&
    !!currentActivityPlanId &&
    !isSubmitting &&
    !existingPlanReadOnly &&
    Boolean(profileId) &&
    selectedPlanIsExecutable;

  const minimumScheduleDate = isEditMode ? undefined : new Date();
  const minimumScheduleDateProps = minimumScheduleDate ? { minimumDate: minimumScheduleDate } : {};

  if (!visible) {
    return null;
  }

  if (existingPlanReadOnly) {
    return (
      <AppFormModal onClose={onClose} testID="schedule-modal" title="Scheduled activity">
        <View
          accessibilityRole="alert"
          className="gap-2 rounded-xl border border-border bg-muted/30 p-4"
        >
          <Text className="font-semibold text-foreground">This event is read-only on mobile</Text>
          <Text className="text-sm text-muted-foreground">
            Executable event records are no longer editable. Use the planned session from Calendar.
          </Text>
        </View>
      </AppFormModal>
    );
  }

  if (!activityPlanId && !activityPlan && !eventId) {
    throw new Error(
      "ScheduleActivityModal requires either activityPlanId, activityPlan, or eventId",
    );
  }

  return (
    <AppFormModal
      dismissDisabled={isSubmitting}
      footerContent={
        <View className="gap-2">
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              onPress={() => requestClose(onClose)}
              disabled={isSubmitting}
              className="flex-1"
              testID="schedule-cancel-button"
            >
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
            <Button
              onPress={submitForm.handleSubmit}
              disabled={!canSchedule || isSubmitting}
              className="flex-1"
              testID="schedule-submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator
                  size="small"
                  color={THEME[resolvedTheme].primaryForeground}
                  className="mr-2"
                />
              ) : null}
              <Text className="text-primary-foreground font-semibold">
                {isEditMode ? "Update Schedule" : "Schedule Activity"}
              </Text>
            </Button>
          </View>
        </View>
      }
      onClose={() => requestClose(onClose)}
      testID="schedule-modal"
      title={isEditMode ? "Update Schedule" : "Schedule Activity"}
      {...(!isLoading && displayPlan ? { description: displayPlan.name } : {})}
    >
      <View className="gap-4">
        {/* Loading State */}
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">Loading activity details...</Text>
          </View>
        ) : displayPlan ? (
          <>
            <View className="gap-2" testID="schedule-preview-details">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Selected activity
              </Text>
              <ActivityPlanCard
                plan={displayPlan}
                testID="schedule-selected-activity-card"
                variant="compact"
              />
              <Text className="text-sm text-muted-foreground">
                Review the session shape before you save the activity.
              </Text>
              {!selectedPlanIsExecutable ? (
                <View
                  accessibilityRole="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                >
                  <Text className="font-medium text-destructive">
                    This plan cannot be scheduled
                  </Text>
                  <Text className="mt-1 text-sm text-destructive/80">
                    Only executable single-activity-category plans can be scheduled.
                  </Text>
                </View>
              ) : null}
            </View>

            <Form {...form}>
              <View className="gap-3">
                <FormDateInputField
                  accessibilityHint="Choose the calendar day for this activity"
                  control={form.control}
                  disabled={isSubmitting}
                  label="Scheduled Date"
                  name="scheduledDate"
                  pickerPresentation="modal"
                  testId={isEditMode ? "scheduled-date-button" : "scheduled-date-field"}
                  {...minimumScheduleDateProps}
                />
              </View>
            </Form>

            {/* Error Messages */}
            {!currentActivityPlanId ? (
              <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <Text className="text-destructive font-medium">
                  This activity cannot be scheduled yet
                </Text>
                <Text className="text-destructive/80 text-sm mt-1">
                  Duplicate the activity plan first, then schedule it from its detail screen.
                </Text>
              </View>
            ) : null}
            {rootErrorMessage ? (
              <View className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <Text className="text-destructive font-medium">
                  Failed to {isEditMode ? "update" : "schedule"} activity
                </Text>
                <Text className="text-destructive/80 text-sm mt-1">{rootErrorMessage}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View className="py-8 items-center">
            <Text className="text-destructive">Failed to load activity details</Text>
          </View>
        )}
      </View>
    </AppFormModal>
  );
}
