import DateTimePicker from "@react-native-community/datetimepicker";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowUpRight, Calendar, CheckCircle2, Ellipsis, Play } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import {
  refreshScheduleViews,
  refreshScheduleWithCallbacks,
} from "@/lib/scheduling/refreshScheduleViews";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { getActivityColor } from "@/lib/utils/plan/colors";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

type EventMutationScope = "single" | "future" | "series";
type CreateEventType = "custom" | "planned";
type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  description?: string | null;
  estimated_duration?: number | null;
};

function isRecurringEvent(event: any) {
  if (!event) {
    return false;
  }

  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function buildAllDayStartIso(value: Date) {
  return `${toDateOnly(value)}T00:00:00.000Z`;
}

function buildLocalDateAtHour(dateKey: string | undefined, hour: number) {
  const fallback = new Date();
  if (!dateKey) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), hour, 0, 0, 0);
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? fallback.getFullYear(), (month ?? 1) - 1, day ?? 1, hour, 0, 0, 0);
}

function parseEventDateForEditor(event: { starts_at: string; all_day?: boolean | null }) {
  if (event.all_day) {
    const dateOnly = event.starts_at.slice(0, 10);
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  }

  return new Date(event.starts_at);
}

function buildCreateStartsAt(dateKey?: string) {
  return buildLocalDateAtHour(dateKey, 9);
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

function formatDurationLabel(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatActivityCategoryLabel(category?: string | null) {
  if (!category) return "Activity";
  return category
    .split("_")
    .map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}` : segment))
    .join(" ");
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

function readEventPlace(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const source = event as {
    location?: string | null;
    place?: string | null;
    venue?: string | null;
  };
  const value = source.location ?? source.place ?? source.venue ?? null;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const { id, mode, date } = useLocalSearchParams<{ id?: string; mode?: string; date?: string }>();
  const eventId = typeof id === "string" ? id : "";
  const startsInEditMode = mode === "edit";
  const startsInCreateMode = mode === "create";
  const createDate = typeof date === "string" ? date : undefined;

  const { beginRedirect, isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });

  const {
    data: event,
    error,
    isLoading,
    refetch,
  } = api.events.getById.useQuery(
    { id: eventId },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: !!eventId && !isRedirecting && !startsInCreateMode,
    },
  );

  const [isEditing, setIsEditing] = useState(startsInEditMode);
  const [createEventType, setCreateEventType] = useState<CreateEventType | null>(null);
  const [activityPlanSearchQuery, setActivityPlanSearchQuery] = useState("");
  const [selectedActivityPlanId, setSelectedActivityPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleScope, setRescheduleScope] = useState<EventMutationScope | undefined>();

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
      setIsEditing(true);
      return;
    }

    if (!event) {
      return;
    }

    setTitle(event.title ?? "");
    setNotes(event.notes ?? "");
    setAllDay(!!event.all_day);
    setStartsAt(parseEventDateForEditor(event));
    setIsEditing(
      startsInEditMode && event.event_type !== "planned" && event.event_type !== "imported",
    );
  }, [createDate, event, startsInCreateMode, startsInEditMode]);

  const createMutation = api.events.create.useMutation({
    onSuccess: async (createdEvent) => {
      await refreshScheduleViews(queryClient, "eventMutation");
      router.replace(ROUTES.PLAN.EVENT_DETAIL(createdEvent.id));
    },
  });

  const updateMutation = api.events.update.useMutation({
    onSuccess: async () => {
      await refreshScheduleWithCallbacks({
        queryClient,
        callbacks: [refetch],
      });
      setIsEditing(false);
    },
  });

  const deleteMutation = api.events.delete.useMutation({
    onSuccess: async () => {
      await refreshScheduleViews(queryClient, "eventDeletionMutation");
      beginRedirect();
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
  const routeId = activityPlan?.route_id as string | undefined;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });
  const { data: routeFull } = api.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: !!routeId },
  );
  const comments = useEntityCommentsController({ entityId: event?.id, entityType: "event" });
  const completed = isPlannedEvent ? isActivityCompleted(event) : false;
  const activityType = activityPlan?.activity_category || "other";
  const activityColor = getActivityColor(activityType);
  const isPastScheduledEvent =
    typeof event?.scheduled_date === "string"
      ? event.scheduled_date < toDateOnly(new Date())
      : false;
  const canStartPlanned = isPlannedEvent && !completed && !isPastScheduledEvent;
  const eventPlace = readEventPlace(event ?? {});
  const detailTitle = startsInCreateMode
    ? "Create Event"
    : isEditing
      ? "Edit Event"
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

  const promptForScope = (
    action: "save" | "delete" | "reschedule",
    onSelect: (scope: EventMutationScope) => void,
  ) => {
    const actionLabel = action === "save" ? "save" : action === "delete" ? "delete" : "update";

    Alert.alert(
      action === "reschedule" ? "Recurring Schedule" : `Recurring Event`,
      `Choose how much of this series to ${actionLabel}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "This event only", onPress: () => onSelect("single") },
        { text: "This and future events", onPress: () => onSelect("future") },
        {
          text: "Entire series",
          style: action === "delete" ? "destructive" : "default",
          onPress: () => onSelect("series"),
        },
      ],
    );
  };

  const submitUpdate = (scope: EventMutationScope = "single") => {
    if (!event) {
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Missing title", "Please add a title for this event.");
      return;
    }

    updateMutation.mutate({
      id: event.id,
      scope,
      patch: {
        title: trimmedTitle,
        notes: notes.trim() ? notes.trim() : null,
        all_day: allDay,
        timezone: "UTC",
        starts_at: allDay ? buildAllDayStartIso(startsAt) : startsAt.toISOString(),
      },
    });
  };

  const handleSave = () => {
    if (startsInCreateMode) {
      submitCreate();
      return;
    }

    if (recurring) {
      promptForScope("save", submitUpdate);
      return;
    }

    submitUpdate("single");
  };

  const submitDelete = (scope: EventMutationScope = "single") => {
    if (!event) {
      return;
    }

    deleteMutation.mutate({ id: event.id, scope });
  };

  const handleDelete = () => {
    Alert.alert(
      isPlannedEvent ? "Delete Activity" : "Delete Event",
      isPlannedEvent
        ? "Are you sure you want to remove this activity from your schedule?"
        : "Are you sure you want to delete this event?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (recurring) {
              promptForScope("delete", submitDelete);
              return;
            }

            submitDelete("single");
          },
        },
      ],
    );
  };

  const handleStartActivity = () => {
    if (!activityPlan || !event) return;

    const payload: ActivityPayload = {
      category: activityPlan.activity_category as any,
      gpsRecordingEnabled: true,
      eventId: event.id,
      plan: activityPlan,
    };

    activitySelectionStore.setSelection(payload);
    navigateTo(ROUTES.RECORD);
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

  const openRescheduleModal = (scope?: EventMutationScope) => {
    setRescheduleScope(scope);
    setShowRescheduleModal(true);
  };

  const handleReschedule = () => {
    if (!event) return;

    openRescheduleModal(recurring ? undefined : "single");
  };

  const resetEditingState = () => {
    if (startsInCreateMode) {
      router.back();
      return;
    }

    if (!event) {
      return;
    }

    setIsEditing(false);
    setTitle(event.title ?? "");
    setNotes(event.notes ?? "");
    setAllDay(!!event.all_day);
    setStartsAt(parseEventDateForEditor(event));
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

  const renderHeaderActions = () => {
    if (isEditing || startsInCreateMode) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger testID="event-detail-options-trigger">
          <View className="rounded-full p-2">
            <Icon as={Ellipsis} size={18} className="text-foreground" />
          </View>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          {isReadOnlyImported ? (
            <DropdownMenuItem onPress={() => router.back()} testID="event-detail-options-close">
              <Text>Close</Text>
            </DropdownMenuItem>
          ) : isPlannedEvent ? (
            <>
              {canStartPlanned ? (
                <DropdownMenuItem
                  onPress={handleStartActivity}
                  testID="event-detail-options-start-activity"
                >
                  <Text>Start Activity</Text>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onPress={handleReschedule} testID="event-detail-options-reschedule">
                <Text>Change Schedule</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={handleOpenPlanDetail}
                testID="event-detail-options-open-linked-plan"
              >
                <Text>Open Activity Plan</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={handleDelete}
                variant="destructive"
                testID="event-detail-options-delete"
              >
                <Text>Delete</Text>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                onPress={() => setIsEditing(true)}
                testID="event-detail-options-edit"
              >
                <Text>Edit Event</Text>
              </DropdownMenuItem>
              <DropdownMenuItem
                onPress={handleDelete}
                variant="destructive"
                testID="event-detail-options-delete"
              >
                <Text>Delete</Text>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

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
              <Text className="text-2xl font-semibold text-foreground">
                {title || activityPlan?.name || "Event"}
              </Text>
              <Text className="text-sm text-muted-foreground capitalize">
                {formatEventType(event?.event_type)}
                {isPlannedEvent && activityColor.name ? ` · ${activityColor.name}` : ""}
                {recurring ? " · recurring" : ""}
              </Text>
              {notes.trim().length > 0 ? (
                <Text className="text-sm leading-5 text-muted-foreground">{notes}</Text>
              ) : null}

              <View className="rounded-2xl border border-border bg-muted/10 px-4 py-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Date</Text>
                  <Text className="text-sm font-medium text-foreground">
                    {format(startsAt, "EEE, MMM d, yyyy")}
                  </Text>
                </View>
                <View className="mt-3 flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Time</Text>
                  <Text className="text-sm font-medium text-foreground">
                    {formatEventTimeRange(event ?? {})}
                  </Text>
                </View>
                {eventPlace ? (
                  <View className="mt-3 flex-row items-center justify-between gap-3">
                    <Text className="text-xs text-muted-foreground">Place</Text>
                    <Text className="text-sm font-medium text-foreground">{eventPlace}</Text>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode && !isPlannedEvent ? (
          <Card className="rounded-3xl border border-border bg-muted/20">
            <CardContent className="p-4 gap-2">
              <View className="flex-row items-start gap-3">
                <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-background">
                  <Icon as={ArrowUpRight} size={16} className="text-muted-foreground" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-foreground">
                    Advanced event detail
                  </Text>
                  <Text
                    className="text-sm text-muted-foreground"
                    testID="event-detail-fallback-note"
                  >
                    Calendar taps open the preview sheet first. Use this fallback screen for deeper
                    edits, schedule changes, linked plan access, or deletion.
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        ) : null}

        {!startsInCreateMode && activityPlan ? (
          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="p-4 gap-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <ActivityPlanSummary
                    activityCategory={activityPlan.activity_category}
                    description={activityPlan.notes || activityPlan.description}
                    estimatedDuration={activityPlan.estimated_duration ?? null}
                    estimatedDurationMinutes={null}
                    estimatedTss={activityPlan.estimated_tss ?? null}
                    intensityFactor={activityPlan.intensity_factor ?? null}
                    routeName={route?.name}
                    routeProvided={!!routeId}
                    structure={activityPlan.structure}
                    subtitle="Attached activity plan"
                    testID="event-detail-attached-plan"
                    title={activityPlan.name || title || "Planned activity"}
                    variant="embedded"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleOpenPlanDetail}
                  activeOpacity={0.85}
                  className="rounded-full border border-border bg-background px-3 py-2"
                  testID="event-detail-open-linked-plan"
                >
                  <Text className="text-sm font-medium text-foreground">Open</Text>
                </TouchableOpacity>
              </View>

              <ActivityPlanContentPreview
                size="medium"
                plan={activityPlan}
                route={route}
                routeFull={routeFull}
                onRoutePress={
                  routeId
                    ? () =>
                        navigateTo({
                          pathname: "/(internal)/(standard)/route-detail",
                          params: { id: routeId },
                        } as never)
                    : null
                }
                intensityFactor={activityPlan?.intensity_factor ?? null}
                tss={activityPlan?.estimated_tss ?? null}
                testIDPrefix="event-detail-plan"
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="p-4 gap-4">
            <View className="gap-1">
              <Text className="text-lg font-semibold text-foreground">{detailTitle}</Text>
              <Text className="text-sm text-muted-foreground capitalize">{detailSubtitle}</Text>
            </View>

            {!isEditing ? (
              <View className="gap-3 rounded-md border border-border bg-muted/10 p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Date</Text>
                  <Text className="text-sm font-medium text-foreground">
                    {format(startsAt, "EEE, MMM d, yyyy")}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Time</Text>
                  <Text className="text-sm font-medium text-foreground">
                    {allDay ? "All day" : format(startsAt, "h:mm a")}
                  </Text>
                </View>
                {!isPlannedEvent && notes.trim().length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs text-muted-foreground">Notes</Text>
                    <Text className="text-sm text-foreground">{notes}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="gap-3">
                <View className="gap-2">
                  {startsInCreateMode ? (
                    <View className="gap-2">
                      <Text className="text-xs text-muted-foreground">Type</Text>
                      <View className="flex-row gap-2">
                        {[
                          ["custom", "Custom event"],
                          ["planned", "Activity plan"],
                        ].map(([value, label]) => {
                          const isSelected = createEventType === value;
                          return (
                            <Pressable
                              key={value}
                              onPress={() => {
                                setCreateEventType(value as CreateEventType);
                                if (value === "custom") {
                                  setSelectedActivityPlanId(null);
                                  setActivityPlanSearchQuery("");
                                }
                              }}
                              className={`flex-1 rounded-md border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                              testID={`event-detail-type-${value}`}
                            >
                              <Text
                                className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text className="text-xs text-muted-foreground">
                        Custom events cover vacation, work, birthdays, holidays, and other non-plan
                        scheduling. Activity plan events schedule a training session from one of
                        your saved plans.
                      </Text>
                    </View>
                  ) : null}

                  {startsInCreateMode && createEventType === "planned" ? (
                    <View className="gap-3">
                      <Text className="text-xs text-muted-foreground">Search activity plans</Text>
                      <Input
                        value={activityPlanSearchQuery}
                        onChangeText={setActivityPlanSearchQuery}
                        placeholder="Search your activity plans"
                        testID="event-detail-activity-plan-search-input"
                      />

                      {selectedCreateActivityPlan ? (
                        <View
                          className="rounded-md border border-primary bg-primary/5 px-3 py-3"
                          testID="event-detail-selected-activity-plan"
                        >
                          <Text className="text-sm font-medium text-foreground">
                            {selectedCreateActivityPlan.name}
                          </Text>
                          <Text className="mt-1 text-xs text-muted-foreground">
                            {formatActivityCategoryLabel(
                              selectedCreateActivityPlan.activity_category,
                            )}
                            {formatDurationLabel(selectedCreateActivityPlan.estimated_duration)
                              ? ` · ${formatDurationLabel(selectedCreateActivityPlan.estimated_duration)}`
                              : ""}
                          </Text>
                        </View>
                      ) : null}

                      {isLoadingActivityPlans ? (
                        <Text className="text-xs text-muted-foreground">
                          Loading activity plans...
                        </Text>
                      ) : activityPlansError ? (
                        <TouchableOpacity
                          onPress={() => void refetchActivityPlans()}
                          activeOpacity={0.85}
                          testID="event-detail-activity-plan-retry"
                        >
                          <Text className="text-xs text-primary">Retry loading activity plans</Text>
                        </TouchableOpacity>
                      ) : filteredActivityPlans.length > 0 ? (
                        <View className="gap-2">
                          {filteredActivityPlans.slice(0, 8).map((plan) => {
                            const isSelected = plan.id === selectedActivityPlanId;
                            return (
                              <TouchableOpacity
                                key={plan.id}
                                onPress={() => {
                                  setSelectedActivityPlanId(plan.id);
                                  if (!title.trim()) {
                                    setTitle(plan.name);
                                  }
                                }}
                                activeOpacity={0.85}
                                className={`rounded-md border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                                testID={`event-detail-activity-plan-option-${plan.id}`}
                              >
                                <Text className="text-sm font-medium text-foreground">
                                  {plan.name}
                                </Text>
                                <Text className="mt-1 text-xs text-muted-foreground">
                                  {formatActivityCategoryLabel(plan.activity_category)}
                                  {formatDurationLabel(plan.estimated_duration)
                                    ? ` · ${formatDurationLabel(plan.estimated_duration)}`
                                    : ""}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <Text className="text-xs text-muted-foreground">
                          No activity plans match that search yet.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <Text className="text-xs text-muted-foreground">Title</Text>
                  <Input
                    value={title}
                    editable={!isReadOnlyImported}
                    onChangeText={setTitle}
                    placeholder="Event title"
                    testID="event-detail-title-input"
                  />
                  {startsInCreateMode && createEventType === "planned" ? (
                    <Text className="text-xs text-muted-foreground">
                      Leave the title as-is to use the selected activity plan name, or customize it.
                    </Text>
                  ) : null}
                </View>

                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Date</Text>
                  <TouchableOpacity
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    disabled={isReadOnlyImported}
                    onPress={() => setShowDatePicker(true)}
                    testID="event-detail-date-button"
                  >
                    <Text className="text-sm text-foreground">
                      {format(startsAt, "EEEE, MMM d, yyyy")}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-3">
                  <View>
                    <Text className="text-sm font-medium text-foreground">All day</Text>
                    <Text className="text-xs text-muted-foreground">Hide time for this event</Text>
                  </View>
                  <Switch
                    checked={allDay}
                    onCheckedChange={setAllDay}
                    disabled={isReadOnlyImported}
                    testId="event-detail-all-day-switch"
                  />
                </View>

                {!allDay ? (
                  <TouchableOpacity
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    disabled={isReadOnlyImported}
                    onPress={() => setShowTimePicker(true)}
                    testID="event-detail-time-button"
                  >
                    <Text className="text-sm text-foreground">{format(startsAt, "h:mm a")}</Text>
                  </TouchableOpacity>
                ) : null}

                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Notes</Text>
                  <Textarea
                    value={notes}
                    onChangeText={setNotes}
                    editable={!isReadOnlyImported}
                    placeholder="Optional notes"
                    testID="event-detail-notes-input"
                  />
                </View>
              </View>
            )}

            {isReadOnlyImported ? (
              <Text className="text-xs text-muted-foreground">
                Imported events are read-only and cannot be edited or deleted.
              </Text>
            ) : recurring ? (
              <Text className="text-xs text-muted-foreground">
                Recurring changes will ask whether to update one event, future events, or the full
                series.
              </Text>
            ) : null}

            {isEditing ? (
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={resetEditingState}
                  disabled={
                    startsInCreateMode ? createMutation.isPending : updateMutation.isPending
                  }
                  testID="event-detail-cancel-edit-button"
                >
                  <Text>Cancel</Text>
                </Button>
                <Button
                  className="flex-1"
                  onPress={handleSave}
                  disabled={
                    startsInCreateMode ? createMutation.isPending : updateMutation.isPending
                  }
                  testID="event-detail-save-button"
                >
                  <Text className="text-primary-foreground">
                    {startsInCreateMode
                      ? createMutation.isPending
                        ? "Creating..."
                        : "Create Event"
                      : updateMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                  </Text>
                </Button>
              </View>
            ) : null}
          </CardContent>
        </Card>

        {!startsInCreateMode ? (
          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Use comments for context that belongs to this scheduled event."
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            testIDPrefix="event-detail"
          />
        ) : null}
      </ScrollView>

      {showDatePicker ? (
        <DateTimePicker
          value={startsAt}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowDatePicker(false);
            if (!selected) {
              return;
            }
            const next = new Date(startsAt);
            next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            setStartsAt(next);
          }}
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={startsAt}
          mode="time"
          display="default"
          onChange={(_, selected) => {
            setShowTimePicker(false);
            if (!selected) {
              return;
            }
            const next = new Date(startsAt);
            next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            setStartsAt(next);
          }}
        />
      ) : null}

      {event && showRescheduleModal ? (
        <ScheduleActivityModal
          visible={showRescheduleModal}
          onClose={() => {
            setShowRescheduleModal(false);
            setRescheduleScope(undefined);
          }}
          eventId={event.id}
          editScope={rescheduleScope}
          onSuccess={async () => {
            await refetch();
            setShowRescheduleModal(false);
            setRescheduleScope(undefined);
          }}
        />
      ) : null}
    </View>
  );
}
