import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import {
  buildAllDayStartIso,
  EventEditorCard,
  parseEventDateForEditor,
} from "@/components/event/EventEditorCard";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { refreshScheduleWithCallbacks } from "@/lib/scheduling/refreshScheduleViews";
import { getActivityColor } from "@/lib/utils/plan/colors";

type EventMutationScope = "single" | "future" | "series";

function isRecurringEvent(event: any) {
  if (!event) {
    return false;
  }

  return !!(event.series_id || event.recurrence_rule || event.recurrence?.rule);
}

function formatEventType(eventType: string | null | undefined) {
  return String(eventType || "event").replace(/_/g, " ");
}

export default function EventDetailUpdateScreen() {
  const router = useRouter();
  const { Stack } = require("expo-router") as typeof import("expo-router");
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof id === "string" ? id : "";

  const { isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
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

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date());

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
  }, [event]);

  const updateMutation = api.events.update.useMutation({
    onSuccess: async () => {
      await refreshScheduleWithCallbacks({
        queryClient,
        callbacks: [refetch],
      });
      router.replace(ROUTES.PLAN.EVENT_DETAIL(eventId));
    },
  });

  const recurring = useMemo(() => isRecurringEvent(event), [event]);
  const isReadOnlyImported = event?.event_type === "imported";
  const activityColor = getActivityColor(event?.activity_plan?.activity_category || "other");
  const detailSubtitle = event
    ? `${formatEventType(event.event_type)}${event.event_type === "planned" && activityColor.name ? ` · ${activityColor.name}` : ""}${recurring ? " · recurring" : ""}`
    : "event";

  const promptForScope = (onSelect: (scope: EventMutationScope) => void) => {
    Alert.alert("Recurring Event", "Choose how much of this series to save.", [
      { text: "Cancel", style: "cancel" },
      { text: "This event only", onPress: () => onSelect("single") },
      { text: "This and future events", onPress: () => onSelect("future") },
      { text: "Entire series", onPress: () => onSelect("series") },
    ]);
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
      promptForScope(submitUpdate);
      return;
    }

    submitUpdate("single");
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

  if (isReadOnlyImported) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">Imported event</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Imported events are read-only and cannot be updated here.
        </Text>
        <Button className="mt-4" onPress={() => router.replace(ROUTES.PLAN.EVENT_DETAIL(event.id))}>
          <Text className="text-primary-foreground">Back to Event</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Update Event" }} />
      <View className="flex-1 p-4">
        <EventEditorCard
          mode="update"
          title="Update event"
          subtitle={detailSubtitle}
          eventTitle={title}
          onChangeEventTitle={setTitle}
          notes={notes}
          onChangeNotes={setNotes}
          allDay={allDay}
          onChangeAllDay={setAllDay}
          startsAt={startsAt}
          onChangeStartsAt={setStartsAt}
          isPending={updateMutation.isPending}
          onCancel={() => router.back()}
          onSubmit={handleSave}
          submitLabel={updateMutation.isPending ? "Saving..." : "Save Changes"}
          helperText={
            recurring
              ? "Recurring changes will ask whether to update one event, future events, or the full series."
              : null
          }
          testIDPrefix="event-detail-update"
        />
      </View>
    </View>
  );
}
