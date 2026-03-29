import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ArrowUpRight, GripVertical, Lock, MoonStar, Play, Target, Zap } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import {
  getEventBadges,
  getEventPrimaryMeta,
  getEventSupportingLine,
  getEventTimeLabel,
  getEventTitle,
  isEditableEvent,
} from "@/lib/calendar/eventPresentation";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { getActivityColor } from "@/lib/utils/plan/colors";

type CalendarEventCardProps = {
  event: CalendarEvent;
  canStart: boolean;
  isDragging: boolean;
  onPress: () => void;
  onQuickActionPress: () => void;
  onDragStart: () => void;
};

export function CalendarEventCard({
  event,
  canStart,
  isDragging,
  onPress,
  onQuickActionPress,
  onDragStart,
}: CalendarEventCardProps) {
  const meta = getEventPrimaryMeta(event);
  const supportingLine = getEventSupportingLine(event);
  const badges = getEventBadges(event).slice(0, 3);
  const activityColor = getActivityColor(event.activity_plan?.activity_category ?? undefined);

  const leadingIcon =
    event.event_type === "planned"
      ? Zap
      : event.event_type === "rest_day"
        ? MoonStar
        : event.event_type === "race_target"
          ? Target
          : event.event_type === "imported"
            ? Lock
            : ArrowUpRight;

  const quickActionLabel = canStart ? "Start" : event.event_type === "imported" ? "View" : "Open";
  const quickActionIcon = canStart ? Play : ArrowUpRight;

  return (
    <View
      className={`rounded-3xl border bg-card/95 p-4 ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
      testID={`schedule-event-${event.id}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-14 pt-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {getEventTimeLabel(event)}
          </Text>
        </View>

        <TouchableOpacity className="flex-1 gap-2" onPress={onPress} activeOpacity={0.85}>
          <View className="flex-row items-start gap-3">
            <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Icon
                as={leadingIcon}
                size={18}
                className={event.event_type === "planned" ? activityColor.text : "text-foreground"}
              />
            </View>
            <View className="flex-1 gap-1 pr-2">
              <Text className="text-sm font-semibold text-foreground">{getEventTitle(event)}</Text>
              {meta.length > 0 ? (
                <Text className="text-xs text-muted-foreground">{meta.join(" • ")}</Text>
              ) : null}
              {supportingLine ? (
                <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                  {supportingLine}
                </Text>
              ) : null}
            </View>
          </View>

          {badges.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {badges.map((badge) => (
                <View
                  key={`${event.id}-${badge}`}
                  className="rounded-full border border-border bg-background px-2 py-1"
                >
                  <Text className="text-[10px] font-medium text-muted-foreground">{badge}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </TouchableOpacity>

        <View className="items-end gap-2">
          {isEditableEvent(event) ? (
            <TouchableOpacity
              onPress={onDragStart}
              className="rounded-full border border-border bg-background p-2"
              activeOpacity={0.85}
              testID={`calendar-drag-handle-${event.id}`}
            >
              <Icon as={GripVertical} size={14} className="text-muted-foreground" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onQuickActionPress}
            className="rounded-full border border-border bg-background px-3 py-2"
            activeOpacity={0.85}
            testID={`schedule-event-action-${event.id}`}
          >
            <View className="flex-row items-center gap-1">
              <Icon as={quickActionIcon} size={12} className="text-foreground" />
              <Text className="text-[11px] font-semibold text-foreground">{quickActionLabel}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
