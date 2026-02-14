import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { BoundedNumberInput } from "../inputs/BoundedNumberInput";
import { IntegerStepper } from "../inputs/IntegerStepper";
import { PercentSliderInput } from "../inputs/PercentSliderInput";
import { parseNumberOrUndefined } from "@/lib/training-plan-form/input-parsers";
import type {
  CreationAvailabilityConfig,
  CreationConfigLocks,
  CreationConstraints,
} from "@repo/core";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import type { TrainingPlanConfigFormData } from "../SinglePageForm";

interface ConstraintsTabProps {
  configData: TrainingPlanConfigFormData;
  expanded: boolean;
  showDetails: boolean;
  informationalConflicts: string[];
  restDaysCount: number;
  weekDays: Array<CreationAvailabilityConfig["days"][number]["day"]>;
  goalDifficultyOptions: Array<{
    value: NonNullable<CreationConstraints["goal_difficulty_preference"]>;
    label: string;
  }>;
  optimizationProfileOptions: Array<{
    value: TrainingPlanConfigFormData["optimizationProfile"];
    label: string;
  }>;
  optimizationProfileHelperCopy: Record<
    TrainingPlanConfigFormData["optimizationProfile"],
    string
  >;
  optimizationProfileDetailCopy: Record<
    TrainingPlanConfigFormData["optimizationProfile"],
    string
  >;
  postGoalRecoveryDetailCopy: string;
  maxWeeklyTssRampDetailCopy: string;
  maxCtlRampDetailCopy: string;
  setFieldLock: (field: keyof CreationConfigLocks, locked: boolean) => void;
  getWeekDayLabel: (day: string) => string;
  onToggleExpanded: () => void;
  onToggleDetails: () => void;
  updateConfig: (updater: (draft: TrainingPlanConfigFormData) => void) => void;
}

export function ConstraintsTab({
  configData,
  expanded,
  showDetails,
  informationalConflicts,
  restDaysCount,
  weekDays,
  goalDifficultyOptions,
  optimizationProfileOptions,
  optimizationProfileHelperCopy,
  optimizationProfileDetailCopy,
  postGoalRecoveryDetailCopy,
  maxWeeklyTssRampDetailCopy,
  maxCtlRampDetailCopy,
  setFieldLock,
  getWeekDayLabel,
  onToggleExpanded,
  onToggleDetails,
  updateConfig,
}: ConstraintsTabProps) {
  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-2.5">
      <Pressable
        onPress={onToggleExpanded}
        className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <View className="flex-1">
          <Text className="text-sm font-medium">Limits</Text>
          <Text className="text-xs text-muted-foreground">
            Rest {restDaysCount}d, sessions{" "}
            {configData.constraints.min_sessions_per_week ?? 0}-
            {configData.constraints.max_sessions_per_week ?? 0}
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
              variant={
                configData.constraintsSource === "user" ? "default" : "outline"
              }
            >
              <Text>Source: {configData.constraintsSource}</Text>
            </Badge>
            <Button variant="outline" size="sm" onPress={onToggleDetails}>
              <Text>{showDetails ? "Hide details" : "Learn"}</Text>
            </Button>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm">Sessions / week</Text>
            <View className="flex-row items-center gap-2">
              <Switch
                checked={configData.locks.min_sessions_per_week.locked}
                onCheckedChange={(value) =>
                  setFieldLock("min_sessions_per_week", Boolean(value))
                }
              />
              <Switch
                checked={configData.locks.max_sessions_per_week.locked}
                onCheckedChange={(value) =>
                  setFieldLock("max_sessions_per_week", Boolean(value))
                }
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <IntegerStepper
                id="min-sessions-per-week"
                label="Min"
                value={configData.constraints.min_sessions_per_week ?? 0}
                min={0}
                max={14}
                onChange={(nextValue) => {
                  updateConfig((draft) => {
                    draft.constraints.min_sessions_per_week = nextValue;
                    draft.constraintsSource = "user";
                  });
                }}
              />
            </View>
            <View className="flex-1">
              <IntegerStepper
                id="max-sessions-per-week"
                label="Max"
                value={configData.constraints.max_sessions_per_week ?? 0}
                min={0}
                max={14}
                onChange={(nextValue) => {
                  updateConfig((draft) => {
                    draft.constraints.max_sessions_per_week = nextValue;
                    draft.constraintsSource = "user";
                  });
                }}
              />
            </View>
          </View>

          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Hard rest days</Text>
              <Switch
                checked={configData.locks.hard_rest_days.locked}
                onCheckedChange={(value) =>
                  setFieldLock("hard_rest_days", Boolean(value))
                }
              />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {weekDays.map((day) => {
                const selected =
                  configData.constraints.hard_rest_days.includes(day);
                return (
                  <Button
                    key={`rest-${day}`}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    onPress={() => {
                      updateConfig((draft) => {
                        draft.constraints.hard_rest_days = selected
                          ? draft.constraints.hard_rest_days.filter(
                              (candidate) => candidate !== day,
                            )
                          : [...draft.constraints.hard_rest_days, day];
                        draft.constraintsSource = "user";
                      });
                    }}
                  >
                    <Text>{getWeekDayLabel(day)}</Text>
                  </Button>
                );
              })}
            </View>
          </View>

          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Max session (min)</Text>
              <Switch
                checked={
                  configData.locks.max_single_session_duration_minutes.locked
                }
                onCheckedChange={(value) =>
                  setFieldLock(
                    "max_single_session_duration_minutes",
                    Boolean(value),
                  )
                }
              />
            </View>
            <IntegerStepper
              id="max-session-duration"
              value={
                configData.constraints.max_single_session_duration_minutes ?? 90
              }
              min={20}
              max={600}
              onChange={(nextValue) => {
                updateConfig((draft) => {
                  draft.constraints.max_single_session_duration_minutes =
                    nextValue;
                  draft.constraintsSource = "user";
                });
              }}
            />
          </View>

          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Goal difficulty</Text>
              <Switch
                checked={configData.locks.goal_difficulty_preference.locked}
                onCheckedChange={(value) =>
                  setFieldLock("goal_difficulty_preference", Boolean(value))
                }
              />
            </View>
            <Select
              value={{
                value:
                  configData.constraints.goal_difficulty_preference ??
                  "balanced",
                label:
                  goalDifficultyOptions.find(
                    (option) =>
                      option.value ===
                      configData.constraints.goal_difficulty_preference,
                  )?.label ?? "Balanced",
              }}
              onValueChange={(option) => {
                if (!option?.value) return;
                updateConfig((draft) => {
                  draft.constraints.goal_difficulty_preference =
                    option.value as "conservative" | "balanced" | "stretch";
                  draft.constraintsSource = "user";
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose preference" />
              </SelectTrigger>
              <SelectContent>
                {goalDifficultyOptions.map((option) => (
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

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium">Plan style</Text>
              <Switch
                checked={configData.locks.optimization_profile.locked}
                onCheckedChange={(value) =>
                  setFieldLock("optimization_profile", Boolean(value))
                }
              />
            </View>
            <Select
              value={{
                value: configData.optimizationProfile,
                label:
                  optimizationProfileOptions.find(
                    (option) => option.value === configData.optimizationProfile,
                  )?.label ?? "Balanced",
              }}
              onValueChange={(option) => {
                if (!option?.value) return;
                updateConfig((draft) => {
                  draft.optimizationProfile =
                    option.value as TrainingPlanConfigFormData["optimizationProfile"];
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose profile" />
              </SelectTrigger>
              <SelectContent>
                {optimizationProfileOptions.map((option) => (
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
            <Text className="text-[11px] text-muted-foreground">
              {optimizationProfileHelperCopy[configData.optimizationProfile]}
            </Text>
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {optimizationProfileDetailCopy[configData.optimizationProfile]}
              </Text>
            )}
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Recovery days</Text>
              <Switch
                checked={configData.locks.post_goal_recovery_days.locked}
                onCheckedChange={(value) =>
                  setFieldLock("post_goal_recovery_days", Boolean(value))
                }
              />
            </View>
            <IntegerStepper
              id="post-goal-recovery-days"
              value={configData.postGoalRecoveryDays}
              min={0}
              max={28}
              onChange={(nextValue) => {
                updateConfig((draft) => {
                  draft.postGoalRecoveryDays = nextValue;
                });
              }}
            />
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {postGoalRecoveryDetailCopy}
              </Text>
            )}
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Weekly load cap (%)</Text>
              <Switch
                checked={configData.locks.max_weekly_tss_ramp_pct.locked}
                onCheckedChange={(value) =>
                  setFieldLock("max_weekly_tss_ramp_pct", Boolean(value))
                }
              />
            </View>
            <PercentSliderInput
              id="max-weekly-load-ramp"
              value={configData.maxWeeklyTssRampPct}
              min={0}
              max={20}
              step={0.25}
              onChange={(nextValue) => {
                updateConfig((draft) => {
                  draft.maxWeeklyTssRampPct = nextValue;
                });
              }}
            />
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {maxWeeklyTssRampDetailCopy}
              </Text>
            )}
          </View>

          <View className="gap-1.5 rounded-md border border-border bg-background/50 p-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm">Weekly CTL cap</Text>
              <Switch
                checked={configData.locks.max_ctl_ramp_per_week.locked}
                onCheckedChange={(value) =>
                  setFieldLock("max_ctl_ramp_per_week", Boolean(value))
                }
              />
            </View>
            <BoundedNumberInput
              id="max-weekly-ctl-ramp"
              label="Cap value"
              value={String(configData.maxCtlRampPerWeek)}
              min={0}
              max={8}
              decimals={2}
              unitLabel="CTL/wk"
              helperText="0-8"
              onChange={(value) => {
                const parsed = parseNumberOrUndefined(value);
                if (parsed === undefined) {
                  return;
                }
                updateConfig((draft) => {
                  draft.maxCtlRampPerWeek = Math.max(
                    0,
                    Math.min(8, Number(parsed.toFixed(2))),
                  );
                });
              }}
            />
            {showDetails && (
              <Text className="text-[11px] text-muted-foreground">
                {maxCtlRampDetailCopy}
              </Text>
            )}
          </View>

          {informationalConflicts.length > 0 && (
            <View className="gap-1 rounded-md border border-amber-300 bg-amber-100/40 p-2">
              <Text className="text-xs font-medium text-amber-800">
                Locked notices
              </Text>
              {informationalConflicts.map((conflict) => (
                <Text key={conflict} className="text-xs text-amber-800">
                  - {conflict}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
