import DateTimePicker from "@react-native-community/datetimepicker";
import type { ActivityPayload } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  Play,
  Trash2,
  Zap,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import {
  refreshScheduleViews,
  refreshScheduleWithCallbacks,
} from "@/lib/scheduling/refreshScheduleViews";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { getActivityBgClass, getActivityColor } from "@/lib/utils/plan/colors";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

type EventMutationScope = "single" | "future" | "series";

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

function parseEventDateForEditor(event: { starts_at: string; all_day?: boolean | null }) {
  if (event.all_day) {
    const dateOnly = event.starts_at.slice(0, 10);
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  }

  return new Date(event.starts_at);
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

export default function EventDetailScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const queryClient = useQueryClient();
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const eventId = typeof id === "string" ? id : "";
  const startsInEditMode = mode === "edit";

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
      enabled: !!eventId && !isRedirecting,
    },
  );

  const [isEditing, setIsEditing] = useState(startsInEditMode);
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
  }, [event, startsInEditMode]);

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
  const isReadOnlyImported = event?.event_type === "imported";
  const isPlannedEvent = event?.event_type === "planned";
  const activityPlan = event?.activity_plan as any;
  const routeId = activityPlan?.route_id as string | undefined;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });
  const completed = isPlannedEvent ? isActivityCompleted(event) : false;
  const activityType = activityPlan?.activity_category || "other";
  const activityColor = getActivityColor(activityType);
  const isPastScheduledEvent =
    typeof event?.scheduled_date === "string"
      ? event.scheduled_date < toDateOnly(new Date())
      : false;
  const canStartPlanned = isPlannedEvent && !completed && !isPastScheduledEvent;

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

  if (isLoading || isRedirecting) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-3">
          {isRedirecting ? "Closing event..." : "Loading event..."}
        </Text>
      </View>
    );
  }

  if (!event) {
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
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        {completed ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-3">
              <View className="flex-row items-center gap-2">
                <Icon as={CheckCircle2} size={20} className="text-green-600" />
                <Text className="font-semibold text-green-600">Activity Completed</Text>
              </View>
            </CardContent>
          </Card>
        ) : null}

        {!isPlannedEvent ? (
          <Card className="border-border bg-muted/20">
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

        <Card>
          <CardContent className="p-4 gap-4">
            <View className="gap-1">
              <CardTitle>
                {isEditing
                  ? "Edit Event"
                  : isPlannedEvent
                    ? activityPlan?.name || title || "Planned activity"
                    : title || "Event"}
              </CardTitle>
              <Text className="text-sm text-muted-foreground capitalize">
                {formatEventType(event.event_type)}
                {isPlannedEvent && activityColor.name ? ` · ${activityColor.name}` : ""}
                {recurring ? " · recurring" : ""}
              </Text>
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
                {notes.trim().length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs text-muted-foreground">Notes</Text>
                    <Text className="text-sm text-foreground">{notes}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="gap-3">
                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Title</Text>
                  <Input
                    value={title}
                    editable={!isReadOnlyImported}
                    onChangeText={setTitle}
                    placeholder="Event title"
                    testID="event-detail-title-input"
                  />
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
          </CardContent>
        </Card>

        {isPlannedEvent ? (
          <Card>
            <CardContent className="p-4 gap-3">
              <View className="flex-row items-center gap-3">
                <View
                  className={`h-10 w-10 ${getActivityBgClass(activityType)} items-center justify-center rounded-full`}
                >
                  <Icon as={Calendar} size={18} className="text-white" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Activity
                  </Text>
                  <Text className="text-sm font-semibold text-foreground">
                    {activityColor.name}
                  </Text>
                </View>
              </View>

              <View className="rounded-2xl bg-muted/30 px-3 py-3">
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-medium text-foreground">
                    {format(startsAt, "EEEE, MMMM d, yyyy")}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {allDay ? "All day" : format(startsAt, "h:mm a")}
                  </Text>
                </View>
                {isPastScheduledEvent && !completed ? (
                  <Text className="mt-2 text-xs text-amber-700">
                    This activity is in the past and can be rescheduled.
                  </Text>
                ) : null}
              </View>
            </CardContent>
          </Card>
        ) : null}

        {activityPlan ? (
          <Card>
            <CardContent className="p-4 gap-4">
              <View className="gap-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Activity details
                </Text>
                <CardTitle>{activityPlan.name || "Planned activity"}</CardTitle>
              </View>

              {activityPlan.description ? (
                <Text className="text-sm leading-5 text-muted-foreground">
                  {activityPlan.description}
                </Text>
              ) : null}

              <ActivityPlanContentPreview
                plan={activityPlan}
                route={route}
                testIDPrefix="event-detail-plan"
              />

              <Button
                variant="outline"
                className="rounded-2xl"
                onPress={handleOpenPlanDetail}
                testID="event-detail-open-plan-button"
              >
                <Text>View Activity Plan</Text>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>

      <View className="px-4 py-4 border-t border-border bg-background">
        {isReadOnlyImported ? (
          <Button variant="outline" onPress={() => router.back()}>
            <Text>Close</Text>
          </Button>
        ) : isPlannedEvent ? (
          <View className="gap-2.5">
            {canStartPlanned ? (
              <Button
                className="rounded-2xl"
                onPress={handleStartActivity}
                testID="event-detail-start-activity-button"
              >
                <Icon as={Play} size={18} className="mr-2 text-primary-foreground" />
                <Text className="text-primary-foreground">Start Activity</Text>
              </Button>
            ) : null}

            <View className="flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-2xl"
                onPress={handleReschedule}
                testID="event-detail-reschedule-button"
              >
                <Icon as={Edit} size={16} className="mr-2 text-foreground" />
                <Text>Edit Activity</Text>
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-2xl"
                onPress={handleOpenPlanDetail}
                testID="event-detail-open-linked-plan-button"
              >
                <Icon as={Zap} size={16} className="mr-2 text-foreground" />
                <Text>View Plan</Text>
              </Button>
            </View>

            <Button
              variant="outline"
              className="rounded-2xl"
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              testID="event-detail-delete-button"
            >
              <Icon as={Trash2} size={16} className="mr-2 text-destructive" />
              <Text className="text-destructive">
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Text>
            </Button>
          </View>
        ) : isEditing ? (
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => {
                setIsEditing(false);
                setTitle(event.title ?? "");
                setNotes(event.notes ?? "");
                setAllDay(!!event.all_day);
                setStartsAt(parseEventDateForEditor(event));
              }}
              disabled={updateMutation.isPending}
              testID="event-detail-cancel-edit-button"
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              className="flex-1"
              onPress={handleSave}
              disabled={updateMutation.isPending}
              testID="event-detail-save-button"
            >
              <Text className="text-primary-foreground">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Text>
            </Button>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setIsEditing(true)}
              testID="event-detail-edit-button"
            >
              <Text>Edit Event</Text>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              testID="event-detail-delete-button"
            >
              <Text className="text-destructive">
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Text>
            </Button>
          </View>
        )}
      </View>

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
