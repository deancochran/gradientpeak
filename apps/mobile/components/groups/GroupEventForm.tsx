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
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { format } from "date-fns";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { ClearFieldAction } from "@/components/shared/ClearFieldAction";
import { InlineNotice, ScreenSection } from "@/components/shared/LayoutPrimitives";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { api } from "@/lib/api";
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
});

type GroupEventFormValues = z.infer<typeof groupEventFormSchema>;

type SelectedActivityPlanOption = {
  activityPlanId: string;
  label: string | null;
  name: string;
  sortOrder: number;
};

type GroupEventFormProps = {
  event?: GroupEventDetail | null;
  groupId: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
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

function toDateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function toTimeKey(value: Date) {
  return format(value, "HH:mm");
}

function buildIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hours ?? 0,
    minutes ?? 0,
    0,
    0,
  ).toISOString();
}

function parseRecurrenceFrequency(rule?: string | null): RecurrenceFrequency {
  const normalized = rule?.toUpperCase() ?? "";
  if (normalized.includes("FREQ=DAILY")) return "daily";
  if (normalized.includes("FREQ=WEEKLY")) return "weekly";
  if (normalized.includes("FREQ=MONTHLY")) return "monthly";
  return "none";
}

function parseRecurrenceEndDate(rule?: string | null) {
  const untilMatch = rule?.toUpperCase().match(/(?:^|;)UNTIL=(\d{8})(?:T\d{6}Z)?(?:;|$)/);
  if (!untilMatch?.[1]) return "";
  return `${untilMatch[1].slice(0, 4)}-${untilMatch[1].slice(4, 6)}-${untilMatch[1].slice(6, 8)}`;
}

function buildRecurrenceRule(frequency: RecurrenceFrequency, endDate: string) {
  if (frequency === "none") return null;
  return `FREQ=${frequency.toUpperCase()};UNTIL=${endDate.replace(/-/g, "")}T235959Z`;
}

function toFormValues(event?: GroupEventDetail | null): GroupEventFormValues {
  const startsAt = event ? new Date(event.starts_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = event?.ends_at ? new Date(event.ends_at) : null;

  return {
    date: toDateKey(Number.isNaN(startsAt.getTime()) ? new Date() : startsAt),
    description: event?.description ?? "",
    endsTime: endsAt && !Number.isNaN(endsAt.getTime()) ? toTimeKey(endsAt) : null,
    locationName: event?.location_name ?? "",
    recurrenceEndDate: parseRecurrenceEndDate(event?.recurrence_rule) || null,
    recurrenceFrequency: parseRecurrenceFrequency(event?.recurrence_rule),
    routeId: event?.route_id ?? null,
    startsTime: toTimeKey(Number.isNaN(startsAt.getTime()) ? new Date() : startsAt),
    title: event?.title ?? "",
  };
}

function toSelectedActivityPlanOptions(
  event?: GroupEventDetail | null,
): SelectedActivityPlanOption[] {
  return (
    event?.activityPlanOptions.map((option, index) => ({
      activityPlanId: option.activity_plan_id,
      label: option.label,
      name: option.label || `Activity plan ${index + 1}`,
      sortOrder: option.sort_order ?? index,
    })) ?? []
  );
}

export const GroupEventForm = forwardRef<GroupEventFormHandle, GroupEventFormProps>(
  function GroupEventForm(
    {
      event,
      groupId,
      isSubmitting = false,
      onCancel,
      onSubmit,
      showFooterActions = true,
      submitLabel,
    },
    ref,
  ) {
    const form = useZodForm({
      schema: groupEventFormSchema,
      defaultValues: toFormValues(event),
    });
    const [recurrenceFrequency, routeId] = form.watch(["recurrenceFrequency", "routeId"]);
    const [selectedActivityPlans, setSelectedActivityPlans] = useState<
      SelectedActivityPlanOption[]
    >(() => toSelectedActivityPlanOptions(event));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRecurringCreate, setIsRecurringCreate] = useState(false);
    const [pickerScope, setPickerScope] = useState<"route" | "activityPlans" | null>(null);
    const { data: selectedRoute } = api.routes.get.useQuery(
      { id: routeId ?? "" },
      { enabled: Boolean(routeId) },
    );

    useEffect(() => {
      form.reset(toFormValues(event));
      setSelectedActivityPlans(toSelectedActivityPlanOptions(event));
    }, [event, form]);

    const selectRoute = (item: ResourcePickerItem) => {
      form.setValue("routeId", item.id, { shouldDirty: true });
      setPickerScope(null);
    };

    const toggleActivityPlan = (item: ResourcePickerItem) => {
      setSelectedActivityPlans((current) => {
        if (current.some((option) => option.activityPlanId === item.id)) {
          return current
            .filter((option) => option.activityPlanId !== item.id)
            .map((option, index) => ({ ...option, sortOrder: index }));
        }

        return [
          ...current,
          { activityPlanId: item.id, label: null, name: item.name, sortOrder: current.length },
        ];
      });
    };

    const submitForm = useCallback(
      async (values: GroupEventFormValues) => {
        const title = values.title.trim();
        if (!title) {
          setErrorMessage("Add a title for this event.");
          return;
        }
        if (!values.date || !values.startsTime) {
          setErrorMessage("Choose a start date and time.");
          return;
        }

        const startsAt = buildIso(values.date, values.startsTime);
        const endsAt = values.endsTime ? buildIso(values.date, values.endsTime) : null;
        if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
          setErrorMessage("End time must be after start time.");
          return;
        }

        setErrorMessage(null);
        const payload = {
          title,
          description: values.description.trim() || null,
          startsAt,
          endsAt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          locationName: values.locationName.trim() || null,
          routeId: values.routeId,
          activityPlans: selectedActivityPlans.map((option, index) => ({
            activityPlanId: option.activityPlanId,
            label: option.label,
            sortOrder: index,
          })),
        };

        if (event) {
          await onSubmit({ groupEventId: event.id, ...payload });
          return;
        }

        if (isRecurringCreate) {
          const recurrenceRule = buildRecurrenceRule(
            values.recurrenceFrequency,
            values.recurrenceEndDate ?? "",
          );
          if (!recurrenceRule) {
            setErrorMessage("Choose how often this event repeats and when the series ends.");
            return;
          }

          await onSubmit({
            groupId,
            ...payload,
            recurrenceRule,
            recurrenceTimezone: payload.timezone || "UTC",
            timezone: payload.timezone || "UTC",
          });
          return;
        }

        await onSubmit({ groupId, ...payload });
      },
      [event, groupId, isRecurringCreate, onSubmit, selectedActivityPlans],
    );

    const handleSubmit = form.handleSubmit(submitForm);

    useImperativeHandle(
      ref,
      () => ({
        submit: () => {
          if (!isSubmitting) {
            void handleSubmit();
          }
        },
      }),
      [handleSubmit, isSubmitting],
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
                      minimumDate={new Date()}
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
              <Text className="text-xs font-medium text-muted-foreground">
                Activity plan options
              </Text>
              <Button onPress={() => setPickerScope("activityPlans")} variant="outline">
                <Text className="text-sm font-semibold text-foreground">Add activity plan</Text>
              </Button>
              {selectedActivityPlans.length > 0 ? (
                <View className="gap-2">
                  {selectedActivityPlans.map((option) => (
                    <View
                      className="rounded-2xl border border-border bg-card p-3"
                      key={option.activityPlanId}
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                            {option.name}
                          </Text>
                        </View>
                        <ClearFieldAction
                          accessibilityLabel={`Remove ${option.name}`}
                          onPress={() =>
                            toggleActivityPlan({ id: option.activityPlanId, name: option.name })
                          }
                          variant="icon"
                        />
                      </View>
                    </View>
                  ))}
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
                disabled={isSubmitting}
                onPress={onCancel}
                variant="outline"
              >
                <Text className="text-sm font-semibold text-foreground">Cancel</Text>
              </Button>
            ) : null}
            <LoadingButton
              className="flex-1"
              disabled={isSubmitting}
              loading={isSubmitting}
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
          description="Choose activity plans athletes can select when they RSVP. Tap selected plans again to remove them."
          onClose={() => setPickerScope(null)}
          onSelect={toggleActivityPlan}
          scope="activityPlans"
          selectedIds={selectedActivityPlans.map((option) => option.activityPlanId)}
          title="Choose activity plans"
          visible={pickerScope === "activityPlans"}
        />
      </View>
    );
  },
);
