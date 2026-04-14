import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ArrowUpRight, Lock, Play, Target, Zap } from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";
import {
  getEventPrimaryMeta,
  getEventStatusLabel,
  getEventSupportingLine,
  getEventTimeLabel,
  getEventTitle,
} from "@/lib/calendar/eventPresentation";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { getActivityColor } from "@/lib/utils/plan/colors";

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

type CalendarEventCardProps = {
  event: CalendarEvent;
  canStart: boolean;
  onPress: () => void;
  onQuickActionPress?: (() => void) | null;
};

export function CalendarEventCard({
  event,
  canStart,
  onPress,
  onQuickActionPress,
}: CalendarEventCardProps) {
  const meta = getEventPrimaryMeta(event);
  const supportingLine = getEventSupportingLine(event);
  const statusLabel = getEventStatusLabel(event);
  const activityColor = getActivityColor(event.activity_plan?.activity_category ?? undefined);
  const timeLabel = getEventTimeLabel(event);
  const planned = event.event_type === "planned";
  const estimatedTss = readMetric(event.activity_plan?.estimated_tss);
  const intensityLevel =
    estimatedTss === null ? 0 : estimatedTss >= 90 ? 3 : estimatedTss >= 55 ? 2 : 1;

  const leadingIcon =
    event.event_type === "planned"
      ? Zap
      : event.event_type === "race_target"
        ? Target
        : event.event_type === "imported"
          ? Lock
          : ArrowUpRight;

  const quickActionIcon = canStart ? Play : ArrowUpRight;

  return (
    <View
      className={`rounded-3xl border bg-card/95 p-4 ${planned ? "border-primary/15" : "border-border"}`}
      testID={`schedule-event-${event.id}`}
    >
      <View className="flex-row items-start gap-3">
        <TouchableOpacity className="flex-1 gap-3" onPress={onPress} activeOpacity={0.85}>
          <View className="flex-row items-start gap-3">
            <View
              className={`mt-0.5 h-10 w-10 items-center justify-center rounded-2xl ${planned ? "bg-primary/10" : "bg-muted/60"}`}
            >
              <Icon
                as={leadingIcon}
                size={18}
                className={planned ? activityColor.text : "text-foreground"}
              />
            </View>
            <View className="flex-1 gap-1 pr-2">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {timeLabel}
                </Text>
                {statusLabel ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-muted-foreground">
                      {statusLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-sm font-semibold text-foreground">{getEventTitle(event)}</Text>
              {meta.length > 0 ? (
                <Text className="text-xs text-muted-foreground">{meta.join(" • ")}</Text>
              ) : null}
              {supportingLine ? (
                <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                  {supportingLine}
                </Text>
              ) : null}
              {planned && (meta.length > 0 || estimatedTss !== null) ? (
                <View className="mt-2 rounded-2xl bg-background px-3 py-3">
                  <View className="flex-row flex-wrap items-center gap-2">
                    {meta.map((item) => (
                      <View key={`${event.id}-${item}`} className="rounded-full bg-muted px-2 py-1">
                        <Text className="text-[10px] font-medium text-muted-foreground">
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {estimatedTss !== null ? (
                    <View className="mt-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Intensity
                        </Text>
                        <Text className="text-[10px] font-medium text-muted-foreground">
                          {Math.round(estimatedTss)} TSS
                        </Text>
                      </View>
                      <View className="mt-2 flex-row gap-2">
                        {Array.from({ length: 3 }, (_, index) => (
                          <View
                            key={`${event.id}-intensity-${index}`}
                            className={`h-2 flex-1 rounded-full ${index < intensityLevel ? activityColor.bg : "bg-muted"}`}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        {onQuickActionPress ? (
          <View className="items-end">
            <TouchableOpacity
              onPress={onQuickActionPress}
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-background"
              activeOpacity={0.85}
              testID={`schedule-event-action-${event.id}`}
            >
              <Icon as={quickActionIcon} size={14} className="text-foreground" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}
