import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { ROUTES } from "@/lib/constants/routes";
import { refreshScheduleViews } from "@/lib/scheduling/refreshScheduleViews";
import { scheduleAwareReadQueryOptions } from "@/lib/trpc/scheduleQueryOptions";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDurationSec } from "@repo/core/utils/dates";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

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

function parseEventDateForEditor(event: {
  starts_at: string;
  all_day?: boolean | null;
}) {
  if (event.all_day) {
    const dateOnly = event.starts_at.slice(0, 10);
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  }

  return new Date(event.starts_at);
}

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function hasIntervals(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") {
    return false;
  }
  const intervals = (structure as Record<string, unknown>).intervals;
  return Array.isArray(intervals) && intervals.length > 0;
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

export default function EventDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const eventId = typeof id === "string" ? id : "";
  const startsInEditMode = mode === "edit";

  const { beginRedirect, isRedirecting, redirectOnNotFound } =
    useDeletedDetailRedirect({
      onRedirect: () => router.replace(ROUTES.PLAN.CALENDAR),
    });

  const {
    data: event,
    error,
    isLoading,
    refetch,
  } = trpc.events.getById.useQuery(
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
    setIsEditing(startsInEditMode);
  }, [event, startsInEditMode]);

  const updateMutation = trpc.events.update.useMutation({
    onSuccess: async () => {
      await Promise.all([refreshScheduleViews(queryClient), refetch()]);
      setIsEditing(false);
    },
  });

  const deleteMutation = trpc.events.delete.useMutation({
    onSuccess: async () => {
      await refreshScheduleViews(queryClient, "eventDeletionMutation");
      beginRedirect();
    },
  });

  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const isReadOnlyImported = event?.event_type === "imported";
  const activityPlan = event?.activity_plan as any;
  const estimatedTss = readMetric(activityPlan?.estimated_tss);
  const estimatedDurationSeconds = readMetric(activityPlan?.estimated_duration);
  const estimatedDurationMinutes = readMetric(
    activityPlan?.estimated_duration_minutes,
  );

  const promptForScope = (
    action: "save" | "delete",
    onSelect: (scope: EventMutationScope) => void,
  ) => {
    const actionLabel = action === "save" ? "save" : "delete";

    Alert.alert(
      `Recurring Event`,
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
        starts_at: allDay
          ? buildAllDayStartIso(startsAt)
          : startsAt.toISOString(),
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
    Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
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
    ]);
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
        <Text className="text-lg font-semibold text-foreground">
          Event not found
        </Text>
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
        <Card>
          <CardContent className="p-4 gap-4">
            <View className="gap-1">
              <CardTitle>
                {isEditing ? "Edit Event" : title || "Event"}
              </CardTitle>
              <Text className="text-sm text-muted-foreground capitalize">
                {formatEventType(event.event_type)}
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
                  />
                </View>

                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Date</Text>
                  <TouchableOpacity
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    disabled={isReadOnlyImported}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text className="text-sm text-foreground">
                      {format(startsAt, "EEEE, MMM d, yyyy")}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-3">
                  <View>
                    <Text className="text-sm font-medium text-foreground">
                      All day
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Hide time for this event
                    </Text>
                  </View>
                  <Switch
                    checked={allDay}
                    onCheckedChange={setAllDay}
                    disabled={isReadOnlyImported}
                  />
                </View>

                {!allDay ? (
                  <TouchableOpacity
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    disabled={isReadOnlyImported}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text className="text-sm text-foreground">
                      {format(startsAt, "h:mm a")}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Notes</Text>
                  <Textarea
                    value={notes}
                    onChangeText={setNotes}
                    editable={!isReadOnlyImported}
                    placeholder="Optional notes"
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
                Recurring changes will ask whether to update one event, future
                events, or the full series.
              </Text>
            ) : null}
          </CardContent>
        </Card>

        {activityPlan ? (
          <Card>
            <CardContent className="p-4 gap-3">
              <CardTitle>Linked Activity Plan</CardTitle>
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">
                  {activityPlan.name || "Planned activity"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {(activityPlan.activity_category || "other").toUpperCase()}
                </Text>
              </View>

              {estimatedTss !== null ||
              estimatedDurationSeconds !== null ||
              estimatedDurationMinutes !== null ? (
                <View className="flex-row gap-5">
                  {estimatedTss !== null ? (
                    <View>
                      <Text className="text-xs text-muted-foreground">TSS</Text>
                      <Text className="text-sm font-semibold text-foreground">
                        {Math.round(estimatedTss)}
                      </Text>
                    </View>
                  ) : null}
                  {estimatedDurationSeconds !== null ||
                  estimatedDurationMinutes !== null ? (
                    <View>
                      <Text className="text-xs text-muted-foreground">
                        Duration
                      </Text>
                      <Text className="text-sm font-semibold text-foreground">
                        {estimatedDurationSeconds !== null
                          ? formatDurationSec(
                              Math.max(0, estimatedDurationSeconds),
                            )
                          : `${Math.round(estimatedDurationMinutes || 0)}min`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {hasIntervals(activityPlan.structure) ? (
                <Text className="text-xs text-muted-foreground">
                  Includes interval structure.
                </Text>
              ) : null}

              <Button
                variant="outline"
                onPress={() => {
                  router.push({
                    pathname: "/activity-plan-detail",
                    params: {
                      eventId: event.id,
                      planId: activityPlan.id,
                    },
                  });
                }}
              >
                <Text>Open Activity Plan Detail</Text>
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
                setStartsAt(new Date(event.starts_at));
              }}
              disabled={updateMutation.isPending}
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              className="flex-1"
              onPress={handleSave}
              disabled={updateMutation.isPending}
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
            >
              <Text>Edit Event</Text>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
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
            next.setFullYear(
              selected.getFullYear(),
              selected.getMonth(),
              selected.getDate(),
            );
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
    </View>
  );
}
