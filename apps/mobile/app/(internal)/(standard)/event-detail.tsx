import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Ellipsis } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { z } from "zod";
import {
  type ActivityPlanListItem,
  buildAllDayStartIso,
  buildCreateStartsAt,
  buildRecurrenceFromFrequency,
  type CreateEventType,
  EventEditorCard,
  type EventRecurrenceFrequency,
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { getEventStatusLabel, getEventTitle } from "@/lib/calendar/eventPresentation";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { getActivityColor } from "@/lib/utils/plan/colors";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

function isRecurringEvent(event: any) {
  if (!event) {
    return false;
  }

  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

function formatEventTimeRange(event: {
  all_day?: boolean | null;
  ends_at?: string | null;
  starts_at?: string | null;
}) {
  if (event.all_day) {
    return "All day";
  }

  if (!event.starts_at) {
    return "Scheduled";
  }

  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) {
    return "Scheduled";
  }

  if (!event.ends_at) {
    return format(start, "h:mm a");
  }

  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) {
    return format(start, "h:mm a");
  }

  return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

const eventCreateEditorFormSchema = z.object({
  title: z.string(),
  notes: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  all_day: z.boolean(),
  recurrence_frequency: z.enum(["none", "daily", "weekly", "monthly"]),
  recurrence_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

function buildDateTimeFromEditorValues(input: {
  date: string;
  time: string | null;
  allDay: boolean;
}) {
  const [year, month, day] = input.date.split("-").map(Number);
  const next = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, input.allDay ? 12 : 0, 0, 0, 0);

  if (!input.allDay && input.time) {
    const [hours, minutes] = input.time.split(":").map(Number);
    next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  }

  return next;
}

type EventMutationScope = "single" | "future" | "series";

function EventStatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

function formatScheduleDateLabel(value: Date) {
  return format(value, "EEEE, MMMM d, yyyy");
}

function formatScheduleRepeatLabel(event: any, recurring: boolean) {
  if (!recurring) {
    return "Does not repeat";
  }

  const frequency = parseRecurrenceFrequency(event);
  const endDate = parseRecurrenceEndDate(event);

  const cadenceLabel =
    frequency === "daily"
      ? "Every day"
      : frequency === "weekly"
        ? "Every week"
        : frequency === "monthly"
          ? "Every month"
          : "Repeats";

  if (!endDate) {
    return cadenceLabel;
  }

  const endAt = new Date(`${endDate}T12:00:00.000Z`);
  if (Number.isNaN(endAt.getTime())) {
    return cadenceLabel;
  }

  return `${cadenceLabel} until ${format(endAt, "MMMM d, yyyy")}`;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const { id, mode, date } = useLocalSearchParams<{ id?: string; mode?: string; date?: string }>();
  const eventId = typeof id === "string" ? id : "";
  const startsInCreateMode = mode === "create";
  const createDate = typeof date === "string" ? date : undefined;

  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });
  const [isClosingAfterDelete, setIsClosingAfterDelete] = useState(false);

  const {
    data: event,
    error,
    isLoading,
  } = api.events.getById.useQuery(
    { id: eventId },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: !!eventId && !isRedirecting && !isClosingAfterDelete && !startsInCreateMode,
    },
  );

  const [createEventType, setCreateEventType] = useState<CreateEventType | null>(null);
  const [activityPlanSearchQuery, setActivityPlanSearchQuery] = useState("");
  const [selectedActivityPlanId, setSelectedActivityPlanId] = useState<string | null>(null);
  const [createFormErrorMessage, setCreateFormErrorMessage] = useState<string | null>(null);
  const [createTitleErrorMessage, setCreateTitleErrorMessage] = useState<string | null>(null);
  const [createRecurrenceErrorMessage, setCreateRecurrenceErrorMessage] = useState<string | null>(
    null,
  );
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteScopeModalVisible, setDeleteScopeModalVisible] = useState(false);
  const [pendingDeleteScope, setPendingDeleteScope] = useState<EventMutationScope | null>(null);
  const form = useZodForm({
    schema: eventCreateEditorFormSchema,
    defaultValues: {
      title: "",
      notes: "",
      start_date: createDate ?? format(buildCreateStartsAt(createDate), "yyyy-MM-dd"),
      start_time: format(buildCreateStartsAt(createDate), "HH:mm"),
      all_day: false,
      recurrence_frequency: "none" as EventRecurrenceFrequency,
      recurrence_end_date: null,
    },
  });
  const title = form.watch("title") || "";
  const notes = form.watch("notes") || "";
  const allDay = form.watch("all_day") ?? false;
  const startDate =
    form.watch("start_date") || format(buildCreateStartsAt(createDate), "yyyy-MM-dd");
  const startTime = form.watch("start_time") ?? null;
  const recurrenceFrequency = form.watch("recurrence_frequency") ?? "none";
  const recurrenceEndDate = form.watch("recurrence_end_date") ?? null;
  const startsAt = buildDateTimeFromEditorValues({ date: startDate, time: startTime, allDay });

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  useEffect(() => {
    if (startsInCreateMode) {
      setCreateEventType(null);
      setActivityPlanSearchQuery("");
      setSelectedActivityPlanId(null);
      const initialStartsAt = buildCreateStartsAt(createDate);
      form.reset({
        title: "",
        notes: "",
        all_day: false,
        start_date: format(initialStartsAt, "yyyy-MM-dd"),
        start_time: format(initialStartsAt, "HH:mm"),
        recurrence_frequency: "none",
        recurrence_end_date: null,
      });
      return;
    }

    if (!startsInCreateMode) {
      return;
    }
  }, [createDate, form, startsInCreateMode]);

  const createMutation = api.events.create.useMutation({
    onSuccess: async (createdEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      router.replace(ROUTES.PLAN.EVENT_DETAIL(createdEvent.id));
    },
  });
  const deleteMutation = api.events.delete.useMutation({
    onSuccess: async () => {
      beginRedirect();
      await refreshScheduleViews(queryClient, "eventMutation");
    },
    onError: () => {
      setIsClosingAfterDelete(false);
    },
  });

  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const isReadOnlyImported = !startsInCreateMode && event?.event_type === "imported";
  const isPlannedEvent = !startsInCreateMode && event?.event_type === "planned";
  const createSupportsRecurrence = createEventType !== "planned";
  const updateSupportsRecurrence = event?.event_type !== "planned";
  const activityPlan = event?.activity_plan as any;
  const {
    data: activityPlansData,
    isLoading: isLoadingActivityPlans,
    error: activityPlansError,
    refetch: refetchActivityPlans,
  } = api.activityPlans.list.useQuery(
    {
      ownerScope: "own",
      limit: 100,
    },
    {
      enabled: startsInCreateMode && createEventType === "planned",
    },
  );
  const availableActivityPlans = useMemo(
    () => (activityPlansData?.items ?? []) as ActivityPlanListItem[],
    [activityPlansData?.items],
  );
  const filteredActivityPlans = useMemo(() => {
    const normalizedQuery = activityPlanSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return availableActivityPlans;
    }

    return availableActivityPlans.filter((plan) => {
      const haystacks = [plan.name, plan.description, plan.activity_category]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());
      return haystacks.some((value) => value.includes(normalizedQuery));
    });
  }, [activityPlanSearchQuery, availableActivityPlans]);
  const selectedCreateActivityPlan = useMemo(
    () => availableActivityPlans.find((plan) => plan.id === selectedActivityPlanId) ?? null,
    [availableActivityPlans, selectedActivityPlanId],
  );
  const comments = useEntityCommentsController({ entityId: event?.id, entityType: "event" });
  const { data: sourceTrainingPlan } = api.trainingPlans.getById.useQuery(
    event?.training_plan_id ? { id: event.training_plan_id } : skipToken,
    {
      ...scheduleAwareReadQueryOptions,
      enabled: !startsInCreateMode && typeof event?.training_plan_id === "string",
    },
  );
  const completed = isPlannedEvent ? isActivityCompleted(event) : false;
  const activityType = activityPlan?.activity_category || "other";
  const activityColor = getActivityColor(activityType);
  const detailTitle = startsInCreateMode
    ? "Create Event"
    : isPlannedEvent
      ? "Schedule details"
      : "Event details";
  const detailSubtitle = startsInCreateMode
    ? createEventType
      ? createEventType === "planned"
        ? "activity plan"
        : "custom event"
      : "choose event type"
    : event
      ? `${formatEventType(event.event_type)}${isPlannedEvent && activityColor.name ? ` · ${activityColor.name}` : ""}${recurring ? " · recurring" : ""}`
      : "event";
  const displayTitle = startsInCreateMode
    ? title || "Create event"
    : event
      ? isPlannedEvent
        ? event.title?.trim() || "Scheduled activity"
        : getEventTitle(event as any)
      : title || activityPlan?.name || "Event";
  const statusLabel = event ? getEventStatusLabel(event as any) : null;
  const displayStartsAt = !startsInCreateMode && event ? new Date(event.starts_at) : startsAt;
  const displayAllDay = startsInCreateMode ? allDay : !!event?.all_day;
  const displayNotes = startsInCreateMode ? notes : (event?.notes ?? "");
  const submitCreate = (values: z.output<typeof eventCreateEditorFormSchema>) => {
    const trimmedTitle = values.title.trim();
    if (!createEventType) {
      setCreateFormErrorMessage("Pick an event type before saving.");
      return;
    }

    if (createEventType === "planned" && !selectedActivityPlanId) {
      setCreateFormErrorMessage("Search and select an activity plan before saving.");
      return;
    }

    const resolvedTitle =
      trimmedTitle ||
      (createEventType === "planned" ? (selectedCreateActivityPlan?.name?.trim() ?? "") : "");

    if (!resolvedTitle) {
      setCreateTitleErrorMessage("Please add a title for this event.");
      return;
    }

    if (
      createSupportsRecurrence &&
      values.recurrence_frequency !== "none" &&
      !values.recurrence_end_date
    ) {
      setCreateRecurrenceErrorMessage("Choose when this repeating series should end.");
      return;
    }

    setCreateFormErrorMessage(null);
    setCreateTitleErrorMessage(null);
    setCreateRecurrenceErrorMessage(null);

    const nextStartsAt = buildDateTimeFromEditorValues({
      date: values.start_date,
      time: values.start_time,
      allDay: values.all_day,
    });

    createMutation.mutate({
      event_type: createEventType,
      activity_plan_id: createEventType === "planned" ? selectedActivityPlanId : undefined,
      title: resolvedTitle,
      notes: values.notes.trim() ? values.notes.trim() : null,
      all_day: values.all_day,
      timezone: "UTC",
      starts_at: values.all_day ? buildAllDayStartIso(nextStartsAt) : nextStartsAt.toISOString(),
      recurrence: createSupportsRecurrence
        ? buildRecurrenceFromFrequency(values.recurrence_frequency, values.recurrence_end_date)
        : undefined,
      lifecycle: { status: "scheduled" },
      read_only: false,
    });
  };

  const submitForm = useZodFormSubmit<z.output<typeof eventCreateEditorFormSchema>>({
    form,
    onSubmit: submitCreate,
  });

  const handleOpenPlanDetail = () => {
    if (!activityPlan?.id || !event) return;

    navigateTo({
      pathname: "/activity-plan-detail",
      params: {
        eventId: event.id,
        planId: activityPlan.id,
      },
    } as any);
  };

  const handleOpenSourceTrainingPlan = () => {
    if (!event?.training_plan_id) {
      return;
    }

    navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(event.training_plan_id) as any);
  };

  const closeDeleteFlow = () => {
    setDeleteScopeModalVisible(false);
    setDeleteConfirmVisible(false);
    setPendingDeleteScope(null);
  };

  const handleSelectDeleteScope = (scope: EventMutationScope) => {
    setPendingDeleteScope(scope);
    setDeleteScopeModalVisible(false);
    setDeleteConfirmVisible(true);
  };

  const handleDeleteEvent = (scope?: EventMutationScope) => {
    if (!event) {
      return;
    }

    setIsClosingAfterDelete(true);
    deleteMutation.mutate(scope ? { id: event.id, scope } : { id: event.id });
  };

  const handleDeletePress = () => {
    if (!event) {
      return;
    }

    if (updateSupportsRecurrence && recurring) {
      setDeleteScopeModalVisible(true);
      return;
    }

    setPendingDeleteScope("single");
    setDeleteConfirmVisible(true);
  };

  const renderHeaderActions = () => {
    if (startsInCreateMode || isReadOnlyImported || !event) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger testID="event-detail-options-trigger">
          <View className="mr-2 rounded-full p-2">
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </View>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem
            onPress={() => router.navigate(ROUTES.PLAN.EVENT_UPDATE(event.id))}
            testID="event-detail-options-edit"
          >
            <Text>Edit Event</Text>
          </DropdownMenuItem>
          {activityPlan?.id ? (
            <DropdownMenuItem
              onPress={handleOpenPlanDetail}
              testID="event-detail-options-open-activity-plan"
            >
              <Text>Open Activity Plan</Text>
            </DropdownMenuItem>
          ) : null}
          {event.training_plan_id ? (
            <DropdownMenuItem
              onPress={handleOpenSourceTrainingPlan}
              testID="event-detail-options-open-training-plan"
            >
              <Text>Open Training Plan</Text>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onPress={handleDeletePress}
            variant="destructive"
            testID="event-detail-options-delete"
          >
            <Text>{deleteMutation.isPending ? "Deleting..." : "Delete Event"}</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if ((!startsInCreateMode && isLoading) || isRedirecting) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-3">
          {isRedirecting ? "Closing event..." : "Loading event..."}
        </Text>
      </View>
    );
  }

  if (!startsInCreateMode && !event) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">Event not found</Text>
        <Text className="text-sm text-muted-foreground text-center mt-2">
          This event may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: renderHeaderActions,
          title: startsInCreateMode ? "Create Event" : undefined,
        }}
      />
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        {!startsInCreateMode && completed ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-3">
              <View className="flex-row items-center gap-2">
                <Icon as={CheckCircle2} size={20} className="text-green-600" />
                <Text className="font-semibold text-green-600">Activity Completed</Text>
              </View>
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode ? (
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="p-4 gap-4">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isPlannedEvent ? "Scheduled activity" : "Scheduled event"}
              </Text>
              <Text className="text-3xl font-semibold text-foreground">{displayTitle}</Text>
              {statusLabel ? <EventStatusPill label={statusLabel} /> : null}
              <View className="rounded-2xl bg-primary/10 px-4 py-3">
                <Text className="text-sm font-semibold text-primary">Schedule</Text>
                <Text className="mt-0.5 text-sm text-primary/80">
                  {formatScheduleDateLabel(displayStartsAt)}
                </Text>
                <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-primary/80">
                  {formatEventTimeRange({
                    all_day: displayAllDay,
                    starts_at: displayStartsAt.toISOString(),
                    ends_at: event?.ends_at ?? null,
                  })}
                </Text>
              </View>
              {displayNotes.trim().length > 0 ? (
                <View className="rounded-2xl bg-muted/30 px-4 py-3">
                  <Text className="text-sm leading-5 text-muted-foreground">{displayNotes}</Text>
                </View>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode && event && (recurring || event.training_plan_id) ? (
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="gap-4 p-4">
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Event details</Text>
                <Text className="text-xs text-muted-foreground">
                  Extra schedule context for this event.
                </Text>
              </View>

              <View className="gap-3 rounded-2xl border border-border bg-muted/10 px-4 py-3">
                {recurring ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-xs text-muted-foreground">Repeats</Text>
                    <Text className="text-sm font-medium text-foreground">
                      {formatScheduleRepeatLabel(event, recurring)}
                    </Text>
                  </View>
                ) : null}
                {event.training_plan_id ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-xs text-muted-foreground">Source</Text>
                    <Text className="text-sm font-medium text-foreground">
                      {sourceTrainingPlan?.name ?? "Training plan"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode && activityPlan ? (
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="gap-4 p-4">
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Linked activity plan</Text>
                <Text className="text-xs text-muted-foreground">
                  Related planning content for this event.
                </Text>
              </View>
              <ActivityPlanCard activityPlan={activityPlan as any} variant="default" />
            </CardContent>
          </Card>
        ) : null}

        {startsInCreateMode ? (
          <EventEditorCard
            mode="create"
            form={form}
            title={detailTitle}
            subtitle={detailSubtitle}
            eventTitle={title}
            onChangeEventTitle={(value) => {
              form.setValue("title", value, { shouldDirty: true });
              setCreateTitleErrorMessage(null);
            }}
            notes={notes}
            onChangeNotes={(value) => form.setValue("notes", value, { shouldDirty: true })}
            allDay={allDay}
            onChangeAllDay={(value) => {
              form.setValue("all_day", value, { shouldDirty: true });
              form.setValue("start_time", value ? null : format(startsAt, "HH:mm"), {
                shouldDirty: true,
              });
            }}
            startsAt={startsAt}
            onChangeStartsAt={(value) => {
              form.setValue("start_date", format(value, "yyyy-MM-dd"), { shouldDirty: true });
              form.setValue("start_time", allDay ? null : format(value, "HH:mm"), {
                shouldDirty: true,
              });
            }}
            recurrenceFrequency={createSupportsRecurrence ? recurrenceFrequency : undefined}
            recurrenceEndDate={createSupportsRecurrence ? recurrenceEndDate : undefined}
            recurrenceErrorMessage={
              createSupportsRecurrence ? createRecurrenceErrorMessage : undefined
            }
            onChangeRecurrenceFrequency={
              createSupportsRecurrence
                ? (value) => {
                    form.setValue("recurrence_frequency", value, { shouldDirty: true });
                    if (value === "none") {
                      form.setValue("recurrence_end_date", null, { shouldDirty: true });
                    }
                    setCreateRecurrenceErrorMessage(null);
                  }
                : undefined
            }
            onChangeRecurrenceEndDate={
              createSupportsRecurrence
                ? (value) => {
                    form.setValue("recurrence_end_date", value, { shouldDirty: true });
                    setCreateRecurrenceErrorMessage(null);
                  }
                : undefined
            }
            isPending={createMutation.isPending || submitForm.isSubmitting}
            onCancel={() => router.back()}
            onSubmit={submitForm.handleSubmit}
            submitLabel={
              createMutation.isPending || submitForm.isSubmitting ? "Creating..." : "Create Event"
            }
            testIDPrefix="event-detail"
            createEventType={createEventType}
            onChangeCreateEventType={(value) => {
              setCreateEventType(value);
              setCreateFormErrorMessage(null);
              if (value === "planned") {
                form.setValue("recurrence_frequency", "none", { shouldDirty: true });
                form.setValue("recurrence_end_date", null, { shouldDirty: true });
                setCreateRecurrenceErrorMessage(null);
              }
              if (value === "custom") {
                setSelectedActivityPlanId(null);
                setActivityPlanSearchQuery("");
              }
            }}
            activityPlanSearchQuery={activityPlanSearchQuery}
            onChangeActivityPlanSearchQuery={(value) => {
              setActivityPlanSearchQuery(value);
              setCreateFormErrorMessage(null);
            }}
            selectedActivityPlanId={selectedActivityPlanId}
            onSelectActivityPlan={(planId) => {
              setSelectedActivityPlanId(planId);
              setCreateFormErrorMessage(null);
              const selectedPlan = availableActivityPlans.find((plan) => plan.id === planId);
              if (!title.trim() && selectedPlan?.name) {
                form.setValue("title", selectedPlan.name, { shouldDirty: true });
              }
            }}
            selectedCreateActivityPlan={selectedCreateActivityPlan}
            filteredActivityPlans={filteredActivityPlans}
            isLoadingActivityPlans={isLoadingActivityPlans}
            activityPlansError={activityPlansError}
            onRetryActivityPlans={() => void refetchActivityPlans()}
            formErrorMessage={createFormErrorMessage}
            titleErrorMessage={createTitleErrorMessage}
          />
        ) : null}

        {!startsInCreateMode ? (
          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Use comments for context that belongs to this scheduled event."
            hasMoreComments={comments.hasMoreComments}
            isLoadingMoreComments={comments.isLoadingMoreComments}
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            onLoadMoreComments={comments.loadMoreComments}
            testIDPrefix="event-detail"
          />
        ) : null}
      </ScrollView>

      {deleteScopeModalVisible ? (
        <AppFormModal
          description="Choose how much of this series to delete."
          onClose={closeDeleteFlow}
          secondaryAction={
            <Button onPress={closeDeleteFlow} variant="outline">
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
          }
          testID="event-detail-delete-scope-modal"
          title="Recurring Event"
        >
          <View className="gap-3">
            <Button
              onPress={() => handleSelectDeleteScope("single")}
              testID="event-detail-delete-scope-single"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This event only</Text>
            </Button>
            <Button
              onPress={() => handleSelectDeleteScope("future")}
              testID="event-detail-delete-scope-future"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This and future events</Text>
            </Button>
            <Button
              onPress={() => handleSelectDeleteScope("series")}
              testID="event-detail-delete-scope-series"
              variant="outline"
            >
              <Text className="text-foreground font-medium">Entire series</Text>
            </Button>
          </View>
        </AppFormModal>
      ) : null}

      {deleteConfirmVisible ? (
        <AppConfirmModal
          description="Are you sure you want to delete this event?"
          onClose={closeDeleteFlow}
          primaryAction={{
            label: deleteMutation.isPending ? "Deleting..." : "Delete Event",
            onPress: () => handleDeleteEvent(pendingDeleteScope ?? undefined),
            testID: "event-detail-delete-confirm",
            variant: "destructive",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: closeDeleteFlow,
            variant: "outline",
          }}
          testID="event-detail-delete-confirm-modal"
          title="Delete Event"
        />
      ) : null}
    </View>
  );
}
