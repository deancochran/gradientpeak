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
import { skipToken, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Ellipsis } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import {
  type CreateEventDefaults,
  CreateEventFlow,
  type CreateEventFlowHandle,
} from "@/components/event/create/CreateEventFlow";
import type { CreateEventMode } from "@/components/event/create/createEventDraft";
import {
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";
import { type ResourcePickerItem, ResourcePickerModal } from "@/components/shared/resource-picker";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { getEventStatusLabel, getEventTitle } from "@/lib/calendar/eventPresentation";
import { ROUTES } from "@/lib/constants/routes";
import { markEstimated } from "@/lib/estimatedMetrics";
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

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAccessDeniedError(error: unknown) {
  const code = (error as { data?: { code?: string | null } | null } | null | undefined)?.data?.code;
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
}

function parseSuggestionTssDelta(value: string | string[] | undefined) {
  const parsed = Number(readSearchParam(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPlanSuggestionDefaults(input: {
  type?: string;
  tssDelta: number | null;
  description?: string;
}): (CreateEventDefaults & { targetTss: number | null }) | null {
  const roundedDelta = input.tssDelta === null ? null : Math.round(input.tssDelta);
  const absoluteDelta = roundedDelta === null ? null : Math.abs(roundedDelta);
  const targetCopy =
    absoluteDelta && absoluteDelta > 0
      ? `Target: about ${markEstimated(`${absoluteDelta} TSS`)}.`
      : null;
  const description = input.description?.trim() || null;
  const notes = [description, targetCopy, "Created from the Plan tab readiness suggestion."]
    .filter(Boolean)
    .join("\n\n");

  if ((input.type === "add_load" || (roundedDelta ?? 0) > 0) && (roundedDelta ?? 0) > 0) {
    return {
      createEventType: "planned" as CreateEventMode,
      title: absoluteDelta
        ? `Suggested ${markEstimated(`${absoluteDelta} TSS`)} session`
        : "Suggested session",
      notes,
      helperText: absoluteDelta
        ? `Plan suggested adding about ${markEstimated(`${absoluteDelta} TSS`)}. Select or adjust the matched activity plan before creating.`
        : "Plan suggested adding load. Select or adjust an activity plan before creating.",
      targetTss: absoluteDelta,
    };
  }

  if (input.type || roundedDelta !== null || description) {
    return {
      createEventType: "custom" as CreateEventMode,
      title: roundedDelta && roundedDelta < 0 ? "Reduce scheduled load" : "Plan adjustment",
      notes,
      helperText:
        "Plan suggested a schedule adjustment. Custom events do not change training load; edit existing sessions to reduce scheduled TSS.",
      targetTss: null,
    };
  }

  return null;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const createEventFlowRef = useRef<CreateEventFlowHandle>(null);
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const {
    id,
    mode,
    date,
    trainingPlanId,
    activityPlanId,
    scheduleGapTssDelta,
    planSuggestionType,
    planSuggestionTssDelta,
    planSuggestionDescription,
  } = useLocalSearchParams<{
    id?: string;
    mode?: string;
    date?: string;
    trainingPlanId?: string;
    activityPlanId?: string;
    scheduleGapTssDelta?: string;
    planSuggestionType?: string;
    planSuggestionTssDelta?: string;
    planSuggestionDescription?: string;
  }>();
  const eventId = typeof id === "string" ? id : "";
  const startsInCreateMode = mode === "create";
  const createDate = typeof date === "string" ? date : undefined;
  const createTrainingPlanId = typeof trainingPlanId === "string" ? trainingPlanId : undefined;
  const preselectedActivityPlanId = typeof activityPlanId === "string" ? activityPlanId : undefined;
  const scheduleGapTss = parseSuggestionTssDelta(scheduleGapTssDelta);
  const scheduleGapNote =
    scheduleGapTss !== null && scheduleGapTss > 0
      ? `Schedule gap: about ${markEstimated(`${Math.round(scheduleGapTss)} TSS`)}.`
      : null;
  const planSuggestionDefaults = useMemo(
    () =>
      buildPlanSuggestionDefaults({
        type: readSearchParam(planSuggestionType),
        tssDelta: parseSuggestionTssDelta(planSuggestionTssDelta),
        description: readSearchParam(planSuggestionDescription),
      }),
    [planSuggestionDescription, planSuggestionTssDelta, planSuggestionType],
  );

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
  const accessDenied = !startsInCreateMode && isAccessDeniedError(error);

  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteScopeModalVisible, setDeleteScopeModalVisible] = useState(false);
  const [pendingDeleteScope, setPendingDeleteScope] = useState<EventMutationScope | null>(null);
  const [activityPlanPickerOpen, setActivityPlanPickerOpen] = useState(false);

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  const deleteMutation = api.events.delete.useMutation({
    onSuccess: async () => {
      beginRedirect();
      await refreshScheduleViews(queryClient, "eventMutation");
    },
    onError: () => {
      setIsClosingAfterDelete(false);
    },
  });
  const updateEventMutation = api.events.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.events.invalidate(),
        refreshScheduleViews(queryClient, "eventMutation"),
      ]);
    },
  });

  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const isReadOnlyImported = !startsInCreateMode && event?.event_type === "imported";
  const isPlannedEvent = !startsInCreateMode && event?.event_type === "planned";
  const updateSupportsRecurrence = event?.event_type !== "planned";
  const activityPlan = event?.activity_plan as any;
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
    ? "choose event type"
    : event
      ? `${formatEventType(event.event_type)}${isPlannedEvent && activityColor.name ? ` · ${activityColor.name}` : ""}${recurring ? " · recurring" : ""}`
      : "event";
  const displayTitle = startsInCreateMode
    ? "Create event"
    : event
      ? isPlannedEvent
        ? event.title?.trim() || "Scheduled activity"
        : getEventTitle(event as any)
      : activityPlan?.name || "Event";
  const statusLabel = event ? getEventStatusLabel(event as any) : null;
  const displayStartsAt = event ? new Date(event.starts_at) : new Date();
  const displayAllDay = !!event?.all_day;
  const displayNotes = event?.notes ?? "";

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

  const handleAttachActivityPlan = async (item: ResourcePickerItem) => {
    if (!event) return;

    try {
      await updateEventMutation.mutateAsync({
        id: event.id,
        scope: "single",
        patch: {
          activity_plan_id: item.id,
          event_type: "planned",
          title: event.title?.trim() || item.name || "Scheduled activity",
        },
      });
      setActivityPlanPickerOpen(false);
    } catch (error) {
      Alert.alert(
        "Unable to attach activity plan",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const handleRemoveActivityPlan = async () => {
    if (!event) return;

    try {
      await updateEventMutation.mutateAsync({
        id: event.id,
        scope: "single",
        patch: {
          activity_plan_id: null,
          event_type: "custom",
          title: event.title?.trim() || activityPlan?.name || "Event",
        },
      });
    } catch (error) {
      Alert.alert(
        "Unable to remove activity plan",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
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
    if (startsInCreateMode) {
      return (
        <Button
          onPress={() => createEventFlowRef.current?.submit()}
          size="sm"
          testID="event-detail-save-button"
          variant="ghost"
        >
          <Text className="text-sm font-semibold text-primary">Create</Text>
        </Button>
      );
    }

    if (isReadOnlyImported || !event) {
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
            <Text className="text-foreground">Edit Event</Text>
          </DropdownMenuItem>
          <DropdownMenuItem
            onPress={() => setActivityPlanPickerOpen(true)}
            testID="event-detail-options-activity-plan"
          >
            <Text className="text-foreground">
              {activityPlan ? "Change Activity Plan" : "Attach Activity Plan"}
            </Text>
          </DropdownMenuItem>
          {activityPlan ? (
            <DropdownMenuItem
              onPress={handleRemoveActivityPlan}
              testID="event-detail-options-remove-activity-plan"
            >
              <Text className="text-foreground">
                {updateEventMutation.isPending ? "Removing..." : "Remove Activity Plan"}
              </Text>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onPress={handleDeletePress}
            variant="destructive"
            testID="event-detail-options-delete"
          >
            <Text className="text-foreground">
              {deleteMutation.isPending ? "Deleting..." : "Delete Event"}
            </Text>
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

  if (accessDenied) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">Event unavailable</Text>
        <Text className="text-sm text-muted-foreground text-center mt-2">
          You do not have permission to view this event.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
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
              <Pressable
                className="flex-row items-center justify-between gap-3"
                onPress={handleOpenSourceTrainingPlan}
                testID="event-detail-source-training-plan"
              >
                <Text className="text-xs text-muted-foreground">Source</Text>
                <Text className="text-sm font-medium text-foreground">
                  {sourceTrainingPlan?.name ?? "Training plan"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!startsInCreateMode && activityPlan ? (
          <View className="gap-2">
            {!isReadOnlyImported ? (
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onPress={() => setActivityPlanPickerOpen(true)}
                  disabled={updateEventMutation.isPending}
                  testID="event-detail-change-activity-plan-button"
                >
                  <Text className="text-foreground">Change Plan</Text>
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onPress={handleRemoveActivityPlan}
                  disabled={updateEventMutation.isPending}
                  testID="event-detail-remove-activity-plan-button"
                >
                  <Text className="text-foreground">Remove Plan</Text>
                </Button>
              </View>
            ) : null}
            <ActivityPlanCard
              activityPlan={activityPlan as any}
              onPress={handleOpenPlanDetail}
              testID="event-detail-activity-plan-card"
              variant="default"
            />
          </View>
        ) : !startsInCreateMode && event && !isReadOnlyImported ? (
          <Pressable
            className="rounded-2xl border border-dashed border-border bg-card px-4 py-4"
            onPress={() => setActivityPlanPickerOpen(true)}
            testID="event-detail-attach-activity-plan-card"
          >
            <Text className="text-sm font-semibold text-foreground">Attach Activity Plan</Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              Search visible activity plans and associate one with this event.
            </Text>
          </Pressable>
        ) : null}

        {startsInCreateMode ? (
          <CreateEventFlow
            ref={createEventFlowRef}
            createDate={createDate}
            defaults={planSuggestionDefaults}
            onCancel={() => router.back()}
            onCreated={(createdEvent) => router.replace(ROUTES.PLAN.EVENT_DETAIL(createdEvent.id))}
            preselectedActivityPlanId={preselectedActivityPlanId}
            scheduleGapNote={scheduleGapNote}
            showFooterActions={false}
            testIDPrefix="event-detail"
            trainingPlanId={createTrainingPlanId}
          />
        ) : null}

        {!startsInCreateMode ? (
          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
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
      <ResourcePickerModal
        visible={activityPlanPickerOpen}
        scope="activityPlans"
        selectedId={activityPlan?.id ?? null}
        title={activityPlan ? "Change Activity Plan" : "Attach Activity Plan"}
        description="Search activity plans visible to your profile."
        onClose={() => setActivityPlanPickerOpen(false)}
        onSelect={handleAttachActivityPlan}
      />
    </View>
  );
}
