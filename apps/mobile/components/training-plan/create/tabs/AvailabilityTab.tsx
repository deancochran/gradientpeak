import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import type { CreationAvailabilityConfig } from "@repo/core";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import type { TrainingPlanConfigFormData } from "../SinglePageForm";

interface AvailabilityTabProps {
  configData: TrainingPlanConfigFormData;
  expanded: boolean;
  selectedAvailabilityDays: number;
  weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]>;
  getWeekDayLabel: (day: string) => string;
  formatMinutesAsTime: (minuteOfDay: number) => string;
  onToggleExpanded: () => void;
  updateConfig: (updater: (draft: TrainingPlanConfigFormData) => void) => void;
}

export function AvailabilityTab({
  configData,
  expanded,
  selectedAvailabilityDays,
  weekDays,
  getWeekDayLabel,
  formatMinutesAsTime,
  onToggleExpanded,
  updateConfig,
}: AvailabilityTabProps) {
  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
      <Pressable
        onPress={onToggleExpanded}
        className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <View className="flex-1">
          <Text className="text-sm font-medium">Availability</Text>
          <Text className="text-xs text-muted-foreground">
            {selectedAvailabilityDays} day(s)
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">
            {expanded ? "Hide" : "Edit"}
          </Text>
          {expanded ? (
            <ChevronUp size={16} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={16} className="text-muted-foreground" />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View className="gap-2 rounded-md border border-border bg-muted/20 p-2.5">
          <View className="gap-1.5">
            {weekDays.map((day) => {
              const dayConfig =
                configData.availabilityConfig.days.find(
                  (item) => item.day === day,
                ) ?? configData.availabilityConfig.days[0];
              if (!dayConfig) {
                return null;
              }

              const isAvailable = dayConfig.windows.length > 0;
              const startLabel = isAvailable
                ? formatMinutesAsTime(
                    dayConfig.windows[0]?.start_minute_of_day ?? 360,
                  )
                : "-";
              const endLabel = isAvailable
                ? formatMinutesAsTime(
                    dayConfig.windows[0]?.end_minute_of_day ?? 450,
                  )
                : "-";

              return (
                <View
                  key={day}
                  className="flex-row items-center justify-between rounded-md border border-border px-2.5 py-2"
                >
                  <Text className="text-sm">{getWeekDayLabel(day)}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground">
                      {startLabel}-{endLabel}
                    </Text>
                    <Switch
                      checked={isAvailable}
                      onCheckedChange={(value) => {
                        const nextValue = Boolean(value);
                        updateConfig((draft) => {
                          draft.availabilityConfig = {
                            ...draft.availabilityConfig,
                            template: "custom",
                            days: draft.availabilityConfig.days.map(
                              (candidate) =>
                                candidate.day === day
                                  ? {
                                      ...candidate,
                                      windows: nextValue
                                        ? [
                                            {
                                              start_minute_of_day: 360,
                                              end_minute_of_day: 450,
                                            },
                                          ]
                                        : [],
                                      max_sessions: nextValue ? 1 : 0,
                                    }
                                  : candidate,
                            ),
                          };
                          draft.availabilityProvenance = {
                            ...draft.availabilityProvenance,
                            source: "user",
                            updated_at: new Date().toISOString(),
                          };
                        });
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
