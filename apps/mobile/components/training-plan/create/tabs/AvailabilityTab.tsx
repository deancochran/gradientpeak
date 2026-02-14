import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import type {
  CreationAvailabilityConfig,
  CreationConfigLocks,
  CreationValueSource,
} from "@repo/core";
import { ChevronDown, ChevronUp, Lock, LockOpen } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import type { TrainingPlanConfigFormData } from "../SinglePageForm";

interface AvailabilityTabProps {
  configData: TrainingPlanConfigFormData;
  expanded: boolean;
  selectedAvailabilityDays: number;
  weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]>;
  availabilityTemplateOptions: Array<{
    value: CreationAvailabilityConfig["template"];
    label: string;
  }>;
  getWeekDayLabel: (day: string) => string;
  formatMinutesAsTime: (minuteOfDay: number) => string;
  getSourceBadgeVariant: (
    source: CreationValueSource,
  ) => "default" | "secondary" | "outline";
  setFieldLock: (field: keyof CreationConfigLocks, locked: boolean) => void;
  onToggleExpanded: () => void;
  updateConfig: (updater: (draft: TrainingPlanConfigFormData) => void) => void;
}

export function AvailabilityTab({
  configData,
  expanded,
  selectedAvailabilityDays,
  weekDays,
  availabilityTemplateOptions,
  getWeekDayLabel,
  formatMinutesAsTime,
  getSourceBadgeVariant,
  setFieldLock,
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
            {selectedAvailabilityDays} day(s),{" "}
            {configData.availabilityConfig.template}
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
          <View className="flex-row items-center justify-between">
            <Badge
              variant={getSourceBadgeVariant(
                configData.availabilityProvenance.source,
              )}
            >
              <Text>Source: {configData.availabilityProvenance.source}</Text>
            </Badge>
            <View className="flex-row items-center gap-2">
              {configData.locks.availability_config.locked ? (
                <Lock size={14} className="text-primary" />
              ) : (
                <LockOpen size={14} className="text-muted-foreground" />
              )}
              <Switch
                checked={configData.locks.availability_config.locked}
                onCheckedChange={(value) =>
                  setFieldLock("availability_config", Boolean(value))
                }
              />
            </View>
          </View>

          <View className="gap-1.5">
            <Label nativeID="availability-template">
              <Text className="text-sm font-medium">Template</Text>
            </Label>
            <Select
              value={{
                value: configData.availabilityConfig.template,
                label:
                  availabilityTemplateOptions.find(
                    (option) =>
                      option.value === configData.availabilityConfig.template,
                  )?.label ?? "Moderate",
              }}
              onValueChange={(option) => {
                if (!option?.value) return;
                updateConfig((draft) => {
                  draft.availabilityConfig = {
                    ...draft.availabilityConfig,
                    template:
                      option.value as CreationAvailabilityConfig["template"],
                  };
                  draft.availabilityProvenance = {
                    ...draft.availabilityProvenance,
                    source: "user",
                    updated_at: new Date().toISOString(),
                  };
                });
              }}
            >
              <SelectTrigger aria-labelledby="availability-template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {availabilityTemplateOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    label={option.label}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </View>

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
