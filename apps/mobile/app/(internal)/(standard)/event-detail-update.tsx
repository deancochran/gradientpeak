import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import {
  buildAllDayStartIso,
  buildRecurrenceFromFrequency,
  EventEditorCard,
  type EventRecurrenceFrequency,
  parseEventDateForEditor,
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { AppFormModal } from "@/components/shared/AppFormModal";
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

const eventEditorFormSchema = z.object({
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

function buildStartsAtFromEditorValues(input: {
  startDate: string;
  startTime: string | null;
  allDay: boolean;
}) {
  const [year, month, day] = input.startDate.split("-").map(Number);
  const next = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, input.allDay ? 12 : 0, 0, 0, 0);

  if (!input.allDay && input.startTime) {
    const [hours, minutes] = input.startTime.split(":").map(Number);
    next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  }

  return next;
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

  const form = useZodForm({
    schema: eventEditorFormSchema,
    defaultValues: {
      title: "",
      notes: "",
      start_date: "1970-01-01",
      start_time: null,
      all_day: false,
      recurrence_frequency: "none" as EventRecurrenceFrequency,
      recurrence_end_date: null,
    },
  });
  const [titleErrorMessage, setTitleErrorMessage] = useState<string | null>(null);
  const [recurrenceErrorMessage, setRecurrenceErrorMessage] = useState<string | null>(null);
  const [saveScopeModalVisible, setSaveScopeModalVisible] = useState(false);
  const [pendingSaveValues, setPendingSaveValues] = useState<z.output<
    typeof eventEditorFormSchema
  > | null>(null);

  const title = form.watch("title") || "";
  const notes = form.watch("notes") || "";
  const allDay = form.watch("all_day") ?? false;
  const startDate = form.watch("start_date") || "1970-01-01";
  const startTime = form.watch("start_time") ?? null;
  const recurrenceFrequency = form.watch("recurrence_frequency") ?? "none";
  const recurrenceEndDate = form.watch("recurrence_end_date") ?? null;
  const startsAt = buildStartsAtFromEditorValues({ startDate, startTime, allDay });

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  useEffect(() => {
    if (!event) {
      return;
    }

    const parsedDate = parseEventDateForEditor(event);
    form.reset({
      title: event.title ?? "",
      notes: event.notes ?? "",
      all_day: !!event.all_day,
      start_date: format(parsedDate, "yyyy-MM-dd"),
      start_time: event.all_day ? null : format(parsedDate, "HH:mm"),
      recurrence_frequency: parseRecurrenceFrequency(event),
      recurrence_end_date: parseRecurrenceEndDate(event),
    });
  }, [event, form]);

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
  const supportsRecurrenceEditing = event?.event_type !== "planned";
  const activityColor = getActivityColor(event?.activity_plan?.activity_category || "other");
  const detailSubtitle = event
    ? `${formatEventType(event.event_type)}${event.event_type === "planned" && activityColor.name ? ` · ${activityColor.name}` : ""}${supportsRecurrenceEditing && recurring ? " · recurring" : ""}`
    : "event";

  const closeSaveScopeModal = () => {
    setSaveScopeModalVisible(false);
    setPendingSaveValues(null);
  };

  const submitUpdate = (
    values: z.output<typeof eventEditorFormSchema>,
    scope: EventMutationScope = "single",
  ) => {
    if (!event) {
      return;
    }

    const trimmedTitle = values.title.trim();
    if (!trimmedTitle) {
      setTitleErrorMessage("Please add a title for this event.");
      return;
    }

    if (
      supportsRecurrenceEditing &&
      values.recurrence_frequency !== "none" &&
      !values.recurrence_end_date
    ) {
      setRecurrenceErrorMessage("Choose when this repeating series should end.");
      return;
    }

    setTitleErrorMessage(null);
    setRecurrenceErrorMessage(null);

    const nextStartsAt = buildStartsAtFromEditorValues({
      startDate: values.start_date,
      startTime: values.start_time,
      allDay: values.all_day,
    });

    updateMutation.mutate({
      id: event.id,
      scope,
      patch: {
        title: trimmedTitle,
        notes: values.notes.trim() ? values.notes.trim() : null,
        all_day: values.all_day,
        timezone: "UTC",
        starts_at: values.all_day ? buildAllDayStartIso(nextStartsAt) : nextStartsAt.toISOString(),
        recurrence: supportsRecurrenceEditing
          ? buildRecurrenceFromFrequency(values.recurrence_frequency, values.recurrence_end_date)
          : undefined,
      },
    });
  };

  const handleSave = (values: z.output<typeof eventEditorFormSchema>) => {
    if (supportsRecurrenceEditing && recurring) {
      setPendingSaveValues(values);
      setSaveScopeModalVisible(true);
      return;
    }

    submitUpdate(values, "single");
  };

  const handleSelectSaveScope = (scope: EventMutationScope) => {
    if (!pendingSaveValues) {
      closeSaveScopeModal();
      return;
    }

    submitUpdate(pendingSaveValues, scope);
    closeSaveScopeModal();
  };

  const submitForm = useZodFormSubmit<z.output<typeof eventEditorFormSchema>>({
    form,
    onSubmit: handleSave,
  });

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
          form={form}
          title="Update event"
          subtitle={detailSubtitle}
          eventTitle={title}
          onChangeEventTitle={(value) => {
            form.setValue("title", value, { shouldDirty: true });
            setTitleErrorMessage(null);
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
          recurrenceFrequency={supportsRecurrenceEditing ? recurrenceFrequency : undefined}
          recurrenceEndDate={supportsRecurrenceEditing ? recurrenceEndDate : undefined}
          recurrenceErrorMessage={supportsRecurrenceEditing ? recurrenceErrorMessage : undefined}
          onChangeRecurrenceFrequency={
            supportsRecurrenceEditing
              ? (value) => {
                  form.setValue("recurrence_frequency", value, { shouldDirty: true });
                  if (value === "none") {
                    form.setValue("recurrence_end_date", null, { shouldDirty: true });
                  }
                  setRecurrenceErrorMessage(null);
                }
              : undefined
          }
          onChangeRecurrenceEndDate={
            supportsRecurrenceEditing
              ? (value) => {
                  form.setValue("recurrence_end_date", value, { shouldDirty: true });
                  setRecurrenceErrorMessage(null);
                }
              : undefined
          }
          isPending={updateMutation.isPending || submitForm.isSubmitting}
          onCancel={() => router.back()}
          onSubmit={submitForm.handleSubmit}
          submitLabel={
            updateMutation.isPending || submitForm.isSubmitting ? "Saving..." : "Save Event"
          }
          helperText={
            supportsRecurrenceEditing && recurring
              ? "Recurring changes will ask whether to update one event, future events, or the full series."
              : null
          }
          titleErrorMessage={titleErrorMessage}
          testIDPrefix="event-detail-update"
        />
      </View>

      {saveScopeModalVisible ? (
        <AppFormModal
          description="Choose how much of this series to save."
          onClose={closeSaveScopeModal}
          secondaryAction={
            <Button onPress={closeSaveScopeModal} variant="outline">
              <Text className="text-foreground font-medium">Cancel</Text>
            </Button>
          }
          testID="event-detail-update-scope-modal"
          title="Recurring Event"
        >
          <View className="gap-3">
            <Button
              onPress={() => handleSelectSaveScope("single")}
              testID="event-detail-update-scope-single"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This event only</Text>
            </Button>
            <Button
              onPress={() => handleSelectSaveScope("future")}
              testID="event-detail-update-scope-future"
              variant="outline"
            >
              <Text className="text-foreground font-medium">This and future events</Text>
            </Button>
            <Button
              onPress={() => handleSelectSaveScope("series")}
              testID="event-detail-update-scope-series"
              variant="outline"
            >
              <Text className="text-foreground font-medium">Entire series</Text>
            </Button>
          </View>
        </AppFormModal>
      ) : null}
    </View>
  );
}
