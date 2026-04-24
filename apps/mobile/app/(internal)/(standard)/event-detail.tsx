import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from "react-native";
import {
  type ActivityPlanListItem,
  buildAllDayStartIso,
  buildCreateStartsAt,
  type CreateEventType,
  EventEditorCard,
} from "@/components/event/EventEditorCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
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

function EventStatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
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

  const {
    data: event,
    error,
    isLoading,
  } = api.events.getById.useQuery(
    { id: eventId },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: !!eventId && !isRedirecting && !startsInCreateMode,
    },
  );

  const [createEventType, setCreateEventType] = useState<CreateEventType | null>(null);
  const [activityPlanSearchQuery, setActivityPlanSearchQuery] = useState("");
  const [selectedActivityPlanId, setSelectedActivityPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date());

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  useEffect(() => {
    if (startsInCreateMode) {
      setCreateEventType(null);
      setActivityPlanSearchQuery("");
      setSelectedActivityPlanId(null);
      setTitle("");
      setNotes("");
      setAllDay(false);
      setStartsAt(buildCreateStartsAt(createDate));
      return;
    }

    if (!startsInCreateMode) {
      return;
    }
  }, [createDate, startsInCreateMode]);

  const createMutation = api.events.create.useMutation({
    onSuccess: async (createdEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      router.replace(ROUTES.PLAN.EVENT_DETAIL(createdEvent.id));
    },
  });

  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const isReadOnlyImported = !startsInCreateMode && event?.event_type === "imported";
  const isPlannedEvent = !startsInCreateMode && event?.event_type === "planned";
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
      ? getEventTitle(event as any)
      : title || activityPlan?.name || "Event";
  const statusLabel = event ? getEventStatusLabel(event as any) : null;
  const displayStartsAt = !startsInCreateMode && event ? new Date(event.starts_at) : startsAt;
  const displayAllDay = startsInCreateMode ? allDay : !!event?.all_day;
  const displayNotes = startsInCreateMode ? notes : (event?.notes ?? "");
  const submitCreate = () => {
    const trimmedTitle = title.trim();
    if (!createEventType) {
      Alert.alert("Choose type", "Pick an event type before saving.");
      return;
    }

    if (createEventType === "planned" && !selectedActivityPlanId) {
      Alert.alert("Choose activity plan", "Search and select an activity plan before saving.");
      return;
    }

    const resolvedTitle =
      trimmedTitle ||
      (createEventType === "planned" ? (selectedCreateActivityPlan?.name?.trim() ?? "") : "");

    if (!resolvedTitle) {
      Alert.alert("Missing title", "Please add a title for this event.");
      return;
    }

    createMutation.mutate({
      event_type: createEventType,
      activity_plan_id: createEventType === "planned" ? selectedActivityPlanId : undefined,
      title: resolvedTitle,
      notes: notes.trim() ? notes.trim() : null,
      all_day: allDay,
      timezone: "UTC",
      starts_at: allDay ? buildAllDayStartIso(startsAt) : startsAt.toISOString(),
      lifecycle: { status: "scheduled" },
      read_only: false,
    });
  };

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

  const renderHeaderActions = () => {
    if (startsInCreateMode || isReadOnlyImported || !event) {
      return null;
    }

    return (
      <TouchableOpacity
        onPress={() => router.navigate(ROUTES.PLAN.EVENT_UPDATE(event.id))}
        className="mr-2 rounded-full px-2 py-1"
        activeOpacity={0.85}
        testID="event-detail-edit-trigger"
      >
        <Text className="text-sm font-medium text-primary">Edit</Text>
      </TouchableOpacity>
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
                Event summary
              </Text>
              <Text className="text-3xl font-semibold text-foreground">{displayTitle}</Text>
              <View className="gap-1">
                <Text className="text-lg font-semibold text-foreground">
                  {format(displayStartsAt, "EEEE, MMMM d, yyyy")}
                </Text>
                <Text className="text-base text-muted-foreground">
                  {formatEventTimeRange({
                    all_day: displayAllDay,
                    starts_at: displayStartsAt.toISOString(),
                    ends_at: event?.ends_at ?? null,
                  })}
                </Text>
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <EventStatusPill label={isPlannedEvent ? "Planned" : "Event"} />
                <Text className="text-sm text-muted-foreground capitalize">
                  {formatEventType(event?.event_type)}
                  {isPlannedEvent && activityColor.name ? ` · ${activityColor.name}` : ""}
                  {recurring ? " · recurring" : ""}
                </Text>
                {statusLabel ? <EventStatusPill label={statusLabel} /> : null}
              </View>
              {displayNotes.trim().length > 0 ? (
                <Text className="text-sm leading-5 text-muted-foreground">{displayNotes}</Text>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode && activityPlan ? (
          <ActivityPlanCard
            activityPlan={activityPlan as any}
            onPress={handleOpenPlanDetail}
            variant="default"
          />
        ) : null}

        {startsInCreateMode ? (
          <EventEditorCard
            mode="create"
            title={detailTitle}
            subtitle={detailSubtitle}
            eventTitle={title}
            onChangeEventTitle={setTitle}
            notes={notes}
            onChangeNotes={setNotes}
            allDay={allDay}
            onChangeAllDay={setAllDay}
            startsAt={startsAt}
            onChangeStartsAt={setStartsAt}
            isPending={createMutation.isPending}
            onCancel={() => router.back()}
            onSubmit={submitCreate}
            submitLabel={createMutation.isPending ? "Creating..." : "Create Event"}
            testIDPrefix="event-detail"
            createEventType={createEventType}
            onChangeCreateEventType={(value) => {
              setCreateEventType(value);
              if (value === "custom") {
                setSelectedActivityPlanId(null);
                setActivityPlanSearchQuery("");
              }
            }}
            activityPlanSearchQuery={activityPlanSearchQuery}
            onChangeActivityPlanSearchQuery={setActivityPlanSearchQuery}
            selectedActivityPlanId={selectedActivityPlanId}
            onSelectActivityPlan={(planId) => {
              setSelectedActivityPlanId(planId);
              const selectedPlan = availableActivityPlans.find((plan) => plan.id === planId);
              if (!title.trim() && selectedPlan?.name) {
                setTitle(selectedPlan.name);
              }
            }}
            selectedCreateActivityPlan={selectedCreateActivityPlan}
            filteredActivityPlans={filteredActivityPlans}
            isLoadingActivityPlans={isLoadingActivityPlans}
            activityPlansError={activityPlansError}
            onRetryActivityPlans={() => void refetchActivityPlans()}
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
    </View>
  );
}
