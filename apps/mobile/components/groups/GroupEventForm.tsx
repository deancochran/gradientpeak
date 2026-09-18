import { formatIsoInstantInIanaZone, scheduledDateTimeToIsoInstant } from "@repo/core/calendar";
import type {
  CreateOneOffGroupEventInput,
  CreateRecurringEventSeriesInput,
  UpdateEventOccurrenceInput,
  UpdateOneOffGroupEventInput,
} from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormDateInputField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
  FormTimezoneField,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { ClearFieldAction } from "@/components/shared/ClearFieldAction";
import { InlineNotice, ScreenSection } from "@/components/shared/LayoutPrimitives";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
import { formatRecurrenceUntil, recurrenceEndDate } from "@/lib/calendar/recurrenceInput";
import type { GroupEventDetail } from "@/lib/groups";

type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly";

const groupEventFormSchema = z.object({
  date: z.string(),
  description: z.string(),
  endsTime: z.string().nullable(),
  locationName: z.string(),
  recurrenceEndDate: z.string().nullable(),
  recurrenceFrequency: z.enum(["none", "daily", "weekly", "monthly"]),
  routeId: z.string().nullable(),
  startsTime: z.string(),
  title: z.string(),
  timezone: z.string().nullable(),
});

type GroupEventFormValues = z.infer<typeof groupEventFormSchema>;

type SelectedActivityPlanOption = {
  activityPlanId: string;
  name: string;
};

type GroupEventFormProps = {
  event?: GroupEventDetail | null;
  groupId: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSubmit: (
    values:
      | CreateOneOffGroupEventInput
      | CreateRecurringEventSeriesInput
      | UpdateEventOccurrenceInput
      | UpdateOneOffGroupEventInput,
  ) => Promise<void> | void;
  showFooterActions?: boolean;
  submitLabel: string;
};

export type GroupEventFormHandle = {
  submit: () => void;
};

function parseRecurrenceFrequency(rule?: string | null): RecurrenceFrequency {
  const normalized = rule?.toUpperCase() ?? "";
  if (normalized.includes("FREQ=DAILY")) return "daily";
  if (normalized.includes("FREQ=WEEKLY")) return "weekly";
  if (normalized.includes("FREQ=MONTHLY")) return "monthly";
  return "none";
}

function buildRecurrenceRule(frequency: RecurrenceFrequency, endDate: string, timezone: string) {
  if (frequency === "none") return null;
  const until = formatRecurrenceUntil(endDate, timezone);
  return `FREQ=${frequency.toUpperCase()};UNTIL=${until}`;
}

function toFormValues(
  event: GroupEventDetail | null | undefined,
  timezone: string,
): GroupEventFormValues {
  const startsAt = event?.starts_at ? formatIsoInstantInIanaZone(event.starts_at, timezone) : "";
  const endsAt = event?.ends_at ? formatIsoInstantInIanaZone(event.ends_at, timezone) : null;

  return {
    date: event ? startsAt.slice(0, 10) : "",
    description: event?.description ?? "",
    endsTime: endsAt?.slice(11, 16) ?? null,
    locationName: event?.location_name ?? "",
    recurrenceEndDate: recurrenceEndDate(event?.recurrence_rule, timezone),
    recurrenceFrequency: parseRecurrenceFrequency(event?.recurrence_rule),
    routeId: event?.route_id ?? null,
    startsTime: event ? startsAt.slice(11, 16) : "",
    title: event?.title ?? "",
    timezone: event?.timezone ?? null,
  };
}

function toSelectedActivityPlan(
  event?: GroupEventDetail | null,
): SelectedActivityPlanOption | null {
  if (!event?.activity_plan_id) return null;
  const activityPlan = (
    event as GroupEventDetail & { activity_plan?: { name?: string | null } | null }
  ).activity_plan;
  return {
    activityPlanId: event.activity_plan_id,
    name: activityPlan?.name?.trim() || "Selected activity plan",
  };
}

export const GroupEventForm = forwardRef<GroupEventFormHandle, GroupEventFormProps>(
  function GroupEventForm(
    {
      event,
      groupId,
      isSubmitting = false,
      onCancel,
      onDirtyChange,
      onSubmit,
      showFooterActions = true,
      submitLabel,
    },
    ref,
  ) {
    const displayTimezone = event?.timezone ?? "UTC";
    const form = useZodForm({
      schema: groupEventFormSchema,
      defaultValues: toFormValues(event, displayTimezone),
    });
    const [recurrenceFrequency, routeId] = form.watch(["recurrenceFrequency", "routeId"]);
    const [selectedActivityPlan, setSelectedActivityPlan] =
      useState<SelectedActivityPlanOption | null>(() => toSelectedActivityPlan(event));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRecurringCreate, setIsRecurringCreate] = useState(false);
    const [pickerScope, setPickerScope] = useState<"route" | "activityPlans" | null>(null);
    const [isLocallySubmitting, setIsLocallySubmitting] = useState(false);
    const submitInFlightRef = useRef(false);
    const { data: selectedRoute } = api.routes.get.useQuery(
      { id: routeId ?? "" },
      { enabled: Boolean(routeId) },
    );
    const selectedActivityPlanQuery = api.activityPlans.getManyByIds.useQuery(
      { ids: selectedActivityPlan ? [selectedActivityPlan.activityPlanId] : [] },
      { enabled: Boolean(selectedActivityPlan) },
    );
    const selectedActivityPlanDetail = selectedActivityPlanQuery.data?.items[0] ?? null;

    useEffect(() => {
      form.reset(toFormValues(event, displayTimezone));
      setSelectedActivityPlan(toSelectedActivityPlan(event));
    }, [displayTimezone, event, form]);
    const isDirty =
      form.formState.isDirty ||
      (selectedActivityPlan?.activityPlanId ?? null) !== (event?.activity_plan_id ?? null) ||
      (!event && isRecurringCreate);
    useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

    const selectRoute = (item: ResourcePickerItem) => {
      form.setValue("routeId", item.id, { shouldDirty: true });
      setPickerScope(null);
    };

    const selectActivityPlan = (item: ResourcePickerItem) => {
      setSelectedActivityPlan((current) =>
        current?.activityPlanId === item.id ? null : { activityPlanId: item.id, name: item.name },
      );
    };

    const submitForm = useCallback(
      async (values: GroupEventFormValues) => {
        const title = values.title.trim();
        if (isSubmitting || submitInFlightRef.current) return;
        if (!title) {
          setErrorMessage("Add a title for this event.");
          return;
        }
        if (!values.date || !values.startsTime) {
          setErrorMessage("Choose a start date and time.");
          return;
        }
        if (!values.timezone) {
          form.setError("timezone", { message: "Choose an event time zone." });
          return;
        }

        let startsAt: string;
        let endsAt: string | null;
        try {
          startsAt = scheduledDateTimeToIsoInstant({
            scheduledDate: values.date,
            time: values.startsTime,
            timeZone: values.timezone,
          });
          endsAt = values.endsTime
            ? scheduledDateTimeToIsoInstant({
                scheduledDate: values.date,
                time: values.endsTime,
                timeZone: values.timezone,
              })
            : null;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Choose valid event times.";
          form.setError("date", { message });
          form.setError("startsTime", { message });
          setErrorMessage(message);
          return;
        }
        if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          const message = "End time must be after start time.";
          form.setError("endsTime", { message });
          setErrorMessage(message);
          return;
        }
        if (
          isRecurringCreate &&
          (!values.recurrenceEndDate || values.recurrenceEndDate < values.date)
        ) {
          const message = "Repeat end date must be on or after the event start date.";
          form.setError("recurrenceEndDate", { message });
          setErrorMessage(message);
          return;
        }

        setErrorMessage(null);
        submitInFlightRef.current = true;
        setIsLocallySubmitting(true);
        const payload = {
          title,
          description: values.description.trim() || null,
          startsAt,
          endsAt,
          timezone: values.timezone,
          locationName: values.locationName.trim() || null,
          routeId: values.routeId,
          activityPlanId: selectedActivityPlan?.activityPlanId ?? null,
        };

        try {
          if (event) {
            await onSubmit({ groupEventId: event.id, ...payload });
            return;
          }

          if (isRecurringCreate) {
            const recurrenceRule = buildRecurrenceRule(
              values.recurrenceFrequency,
              values.recurrenceEndDate ?? "",
              values.timezone,
            );
            if (!recurrenceRule) {
              setErrorMessage("Choose how often this event repeats and when the series ends.");
              return;
            }

            await onSubmit({
              groupId,
              ...payload,
              recurrenceRule,
              recurrenceTimezone: values.timezone,
              timezone: values.timezone,
            });
            return;
          }

          await onSubmit({ groupId, ...payload });
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to save this event. Try again.",
          );
        } finally {
          submitInFlightRef.current = false;
          setIsLocallySubmitting(false);
        }
      },
      [event, form, groupId, isRecurringCreate, isSubmitting, onSubmit, selectedActivityPlan],
    );

    const handleSubmit = form.handleSubmit(submitForm);

    useImperativeHandle(
      ref,
      () => ({
        submit: () => {
          if (!isSubmitting && !isLocallySubmitting) {
            void handleSubmit();
          }
        },
      }),
      [handleSubmit, isLocallySubmitting, isSubmitting],
    );

    return (
      <View className="gap-5">
        <Form {...form}>
          <View className="gap-4">
            <FormTextField
              control={form.control}
              label="Title"
              name="title"
              placeholder="Sunday long run"
              required
            />
            {!event ? (
              <ScreenSection
                description="Choose whether this is a one-time meetup or a repeated group series."
                title="Event cadence"
              >
                <View className="flex-row gap-2">
                  <Button
                    accessibilityRole="button"
                    accessibilityState={{ selected: !isRecurringCreate }}
                    className="flex-1"
                    onPress={() => setIsRecurringCreate(false)}
                    variant={isRecurringCreate ? "outline" : "default"}
                  >
                    <Text
                      className={
                        isRecurringCreate
                          ? "text-sm font-semibold text-foreground"
                          : "text-sm font-semibold text-primary-foreground"
                      }
                    >
                      One-time
                    </Text>
                  </Button>
                  <Button
                    accessibilityRole="button"
                    accessibilityState={{ selected: isRecurringCreate }}
                    className="flex-1"
                    onPress={() => {
                      setIsRecurringCreate(true);
                      if (recurrenceFrequency === "none") {
                        form.setValue("recurrenceFrequency", "weekly", { shouldDirty: true });
                      }
                    }}
                    variant={isRecurringCreate ? "default" : "outline"}
                  >
                    <Text
                      className={
                        isRecurringCreate
                          ? "text-sm font-semibold text-primary-foreground"
                          : "text-sm font-semibold text-foreground"
                      }
                    >
                      Recurring
                    </Text>
                  </Button>
                </View>
                {isRecurringCreate ? (
                  <View className="gap-3">
                    <View className="gap-2">
                      <Text className="text-xs font-medium text-muted-foreground">Repeats</Text>
                      <View className="flex-row flex-wrap gap-2">
                        {(
                          [
                            ["daily", "Daily"],
                            ["weekly", "Weekly"],
                            ["monthly", "Monthly"],
                          ] as Array<[RecurrenceFrequency, string]>
                        ).map(([frequency, label]) => {
                          const isSelected = recurrenceFrequency === frequency;
                          return (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                              className={
                                isSelected
                                  ? "rounded-xl border border-primary bg-primary/10 px-3 py-2"
                                  : "rounded-xl border border-border bg-card px-3 py-2"
                              }
                              key={frequency}
                              onPress={() =>
                                form.setValue("recurrenceFrequency", frequency, {
                                  shouldDirty: true,
                                })
                              }
                            >
                              <Text
                                className={
                                  isSelected
                                    ? "text-sm font-semibold text-primary"
                                    : "text-sm font-semibold text-foreground"
                                }
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <FormDateInputField
                      accessibilityHint="Choose when this repeating group event should end"
                      control={form.control}
                      label="Repeat until"
                      minimumDate={new Date(`${form.getValues("date")}T12:00:00`)}
                      name="recurrenceEndDate"
                      pickerPresentation="modal"
                      testId="group-event-recurrence-end-date-button"
                    />
                  </View>
                ) : null}
              </ScreenSection>
            ) : null}
            <FormTextareaField
              className="min-h-[120px]"
              control={form.control}
              label="Description"
              name="description"
              placeholder="Share the plan, pace, or meetup notes."
            />
            <FormDateInputField
              accessibilityHint="Choose the group event date"
              control={form.control}
              label="Date"
              name="date"
              pickerPresentation="modal"
              required
              testId="group-event-date-button"
            />
            <FormTimezoneField
              control={form.control}
              deviceTimeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
              label="Event time zone"
              name="timezone"
              required
              testId="group-event-timezone"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormTimeInputField
                  accessibilityHint="Choose the event start time"
                  control={form.control}
                  label="Start time"
                  name="startsTime"
                  pickerPresentation="modal"
                  required
                  testId="group-event-start-time-button"
                />
              </View>
              <View className="flex-1">
                <FormTimeInputField
                  accessibilityHint="Choose the event end time"
                  control={form.control}
                  label="End time"
                  name="endsTime"
                  pickerPresentation="modal"
                  testId="group-event-end-time-button"
                />
              </View>
            </View>
            <FormTextField
              control={form.control}
              label="Location"
              name="locationName"
              placeholder="Trailhead, track, cafe..."
            />
            <View className="gap-2">
              <Text className="text-xs font-medium text-muted-foreground">Route</Text>
              <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
                <Pressable className="min-w-0 flex-1 py-1" onPress={() => setPickerScope("route")}>
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                    {selectedRoute?.name ?? (routeId ? "Selected route" : "Choose route")}
                  </Text>
                </Pressable>
                {routeId ? (
                  <ClearFieldAction
                    accessibilityLabel="Remove route"
                    onPress={() => form.setValue("routeId", null, { shouldDirty: true })}
                    variant="icon"
                  />
                ) : null}
              </View>
            </View>
            <View className="gap-2">
              <Text className="text-xs font-medium text-muted-foreground">Activity plan</Text>
              <Button onPress={() => setPickerScope("activityPlans")} variant="outline">
                <Text className="text-sm font-semibold text-foreground">
                  {selectedActivityPlan ? "Change activity plan" : "Choose activity plan"}
                </Text>
              </Button>
              {selectedActivityPlan ? (
                <View className="gap-2">
                  {selectedActivityPlanQuery.isLoading ? (
                    <Text className="text-sm text-muted-foreground">Loading activity plan...</Text>
                  ) : null}
                  {selectedActivityPlanDetail ? (
                    <View className="gap-2">
                      <ActivityPlanCard plan={selectedActivityPlanDetail} variant="compact" />
                      <ClearFieldAction
                        accessibilityLabel={`Remove ${selectedActivityPlan.name}`}
                        onPress={() => setSelectedActivityPlan(null)}
                        variant="icon"
                      />
                    </View>
                  ) : !selectedActivityPlanQuery.isLoading ? (
                    <Text className="text-sm text-destructive">
                      Activity plan is unavailable. Choose another plan or remove this selection.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </Form>

        {errorMessage ? <InlineNotice tone="error">{errorMessage}</InlineNotice> : null}

        {showFooterActions ? (
          <View className="flex-row gap-3">
            {onCancel ? (
              <Button
                className="flex-1"
                disabled={isSubmitting || isLocallySubmitting}
                onPress={onCancel}
                variant="outline"
              >
                <Text className="text-sm font-semibold text-foreground">Cancel</Text>
              </Button>
            ) : null}
            <LoadingButton
              className="flex-1"
              disabled={isSubmitting || isLocallySubmitting}
              loading={isSubmitting || isLocallySubmitting}
              loadingLabel="Saving..."
              onPress={handleSubmit}
            >
              <Text className="text-sm font-semibold text-primary-foreground">{submitLabel}</Text>
            </LoadingButton>
          </View>
        ) : null}
        <ResourcePickerModal
          description="Choose an accessible route for this group event."
          onClose={() => setPickerScope(null)}
          onSelect={selectRoute}
          scope="routes"
          selectedId={routeId}
          title="Choose route"
          visible={pickerScope === "route"}
        />
        <ResourcePickerModal
          description="Choose the activity plan for this group event. Tap the selected plan again to remove it."
          onClose={() => setPickerScope(null)}
          onSelect={selectActivityPlan}
          scope="activityPlans"
          selectedId={selectedActivityPlan?.activityPlanId ?? null}
          title="Choose activity plan"
          visible={pickerScope === "activityPlans"}
        />
      </View>
    );
  },
);
