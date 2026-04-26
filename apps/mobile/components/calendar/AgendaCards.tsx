import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import React from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import {
  parseRecurrenceEndDate,
  parseRecurrenceFrequency,
} from "@/components/event/EventEditorCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { getEventStatusLabel } from "@/lib/calendar/eventPresentation";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";

function readEventDescription(event: CalendarEvent): string | null {
  const text = event.description?.trim() || event.notes?.trim() || null;
  return text && text.length > 0 ? text : null;
}

function formatRecurrenceLabel(event: CalendarEvent): string | null {
  const frequency = parseRecurrenceFrequency(event);
  if (frequency === "none") {
    return null;
  }

  const cadenceLabel =
    frequency === "daily"
      ? "Every day"
      : frequency === "weekly"
        ? "Every week"
        : frequency === "monthly"
          ? "Every month"
          : "Repeats";

  const endDate = parseRecurrenceEndDate(event);
  if (!endDate) {
    return cadenceLabel;
  }

  const endAt = new Date(`${endDate}T12:00:00.000Z`);
  if (Number.isNaN(endAt.getTime())) {
    return cadenceLabel;
  }

  return `${cadenceLabel} until ${format(endAt, "MMMM d, yyyy")}`;
}

function buildScheduleSummary(event: CalendarEvent, statusLabel: string | null): string {
  const recurrenceLabel = statusLabel === "Recurring" ? formatRecurrenceLabel(event) : null;
  const parts = [
    recurrenceLabel ?? statusLabel,
    event.training_plan_id ? "From training plan" : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function GoalAgendaCard({ onPress, title }: { onPress: () => void; title: string }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-3xl border border-primary/20 bg-primary/5 px-4 py-4"
      testID="calendar-day-goal-anchor"
    >
      <Text className="text-xs font-semibold uppercase tracking-wide text-primary">Goal</Text>
      <Text className="mt-2 text-xl font-semibold text-foreground">{title}</Text>
      <Text className="mt-1 text-sm text-muted-foreground">Target day on your timeline.</Text>
    </Pressable>
  );
}

export function PlannedAgendaEventCard({
  event,
  onPress,
  scheduleLabel,
}: {
  event: CalendarEvent;
  onPress: () => void;
  scheduleLabel: string;
}) {
  const statusLabel = getEventStatusLabel(event);
  const eventTitle = event.title?.trim() || "Scheduled activity";
  const eventDescription = readEventDescription(event);
  const scheduleSummary = buildScheduleSummary(event, statusLabel);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-3xl border border-border bg-card px-4 py-4"
      testID={`schedule-event-${event.id}`}
    >
      <View className="gap-4">
        <View className="gap-3">
          <Text className="text-2xl font-semibold text-foreground">{eventTitle}</Text>

          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {scheduleLabel}
            </Text>
          </View>

          {scheduleSummary ? (
            <Text className="text-sm text-muted-foreground">{scheduleSummary}</Text>
          ) : null}

          {eventDescription ? (
            <Text className="text-sm leading-5 text-muted-foreground">{eventDescription}</Text>
          ) : null}
        </View>

        {event.activity_plan ? (
          <View className="gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Linked activity plan
            </Text>
            <ActivityPlanCard activityPlan={event.activity_plan as any} variant="compact" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function EventAgendaCard({
  event,
  onPress,
  place,
  scheduleLabel,
}: {
  event: CalendarEvent;
  onPress: () => void;
  place?: string | null;
  scheduleLabel: string;
}) {
  const statusLabel = getEventStatusLabel(event);
  const eventTitle = event.title?.trim() || "Scheduled event";
  const eventDescription = readEventDescription(event);
  const scheduleSummary = buildScheduleSummary(event, statusLabel);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-3xl border border-border bg-card px-4 py-4"
      testID={`schedule-event-${event.id}`}
    >
      <View className="gap-3">
        <Text className="text-xl font-semibold text-foreground">{eventTitle}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {scheduleLabel}
          </Text>
        </View>
        {scheduleSummary ? (
          <Text className="text-sm text-muted-foreground">{scheduleSummary}</Text>
        ) : null}
        {eventDescription ? (
          <Text className="text-sm leading-5 text-muted-foreground">{eventDescription}</Text>
        ) : null}
        {place ? <Text className="text-xs text-muted-foreground">{place}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
