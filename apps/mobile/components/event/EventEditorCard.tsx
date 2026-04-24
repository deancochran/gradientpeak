import DateTimePicker from "@react-native-community/datetimepicker";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { format } from "date-fns";
import React, { useState } from "react";
import { Pressable, TouchableOpacity, View } from "react-native";
import { getAuthoritativeActivityPlanMetrics } from "@/lib/activityPlanMetrics";

export type CreateEventType = "custom" | "planned";

export type ActivityPlanListItem = {
  id: string;
  name: string;
  activity_category?: string | null;
  description?: string | null;
  authoritative_metrics?: { estimated_duration?: number | null } | null;
};

export function toDateOnly(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export function buildAllDayStartIso(value: Date) {
  return `${toDateOnly(value)}T00:00:00.000Z`;
}

function buildLocalDateAtHour(dateKey: string | undefined, hour: number) {
  const fallback = new Date();
  if (!dateKey) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), hour, 0, 0, 0);
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? fallback.getFullYear(), (month ?? 1) - 1, day ?? 1, hour, 0, 0, 0);
}

export function parseEventDateForEditor(event: { starts_at: string; all_day?: boolean | null }) {
  if (event.all_day) {
    const dateOnly = event.starts_at.slice(0, 10);
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  }

  return new Date(event.starts_at);
}

export function buildCreateStartsAt(dateKey?: string) {
  return buildLocalDateAtHour(dateKey, 9);
}

function formatDurationLabel(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatActivityCategoryLabel(category?: string | null) {
  if (!category) return "Activity";
  return category
    .split("_")
    .map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}` : segment))
    .join(" ");
}

type EventEditorCardProps = {
  mode: "create" | "update";
  title: string;
  subtitle: string;
  eventTitle: string;
  onChangeEventTitle: (value: string) => void;
  notes: string;
  onChangeNotes: (value: string) => void;
  allDay: boolean;
  onChangeAllDay: (value: boolean) => void;
  startsAt: Date;
  onChangeStartsAt: (value: Date) => void;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  helperText?: string | null;
  testIDPrefix: string;
  createEventType?: CreateEventType | null;
  onChangeCreateEventType?: (value: CreateEventType) => void;
  activityPlanSearchQuery?: string;
  onChangeActivityPlanSearchQuery?: (value: string) => void;
  selectedActivityPlanId?: string | null;
  onSelectActivityPlan?: (planId: string) => void;
  selectedCreateActivityPlan?: ActivityPlanListItem | null;
  filteredActivityPlans?: ActivityPlanListItem[];
  isLoadingActivityPlans?: boolean;
  activityPlansError?: unknown;
  onRetryActivityPlans?: () => void;
};

export function EventEditorCard({
  mode,
  title,
  subtitle,
  eventTitle,
  onChangeEventTitle,
  notes,
  onChangeNotes,
  allDay,
  onChangeAllDay,
  startsAt,
  onChangeStartsAt,
  isPending,
  onCancel,
  onSubmit,
  submitLabel,
  helperText,
  testIDPrefix,
  createEventType,
  onChangeCreateEventType,
  activityPlanSearchQuery,
  onChangeActivityPlanSearchQuery,
  selectedActivityPlanId,
  onSelectActivityPlan,
  selectedCreateActivityPlan,
  filteredActivityPlans,
  isLoadingActivityPlans,
  activityPlansError,
  onRetryActivityPlans,
}: EventEditorCardProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  return (
    <>
      <Card className="rounded-3xl border border-border bg-card">
        <CardContent className="p-4 gap-4">
          <View className="gap-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Schedule details
            </Text>
            <Text className="text-2xl font-semibold text-foreground">{title}</Text>
            <Text className="text-sm text-muted-foreground capitalize">{subtitle}</Text>
          </View>

          <View className="gap-3">
            <View className="gap-2">
              {mode === "create" && onChangeCreateEventType ? (
                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">Type</Text>
                  <View className="flex-row gap-2">
                    {[
                      ["custom", "Custom event"],
                      ["planned", "Activity plan"],
                    ].map(([value, label]) => {
                      const isSelected = createEventType === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => onChangeCreateEventType(value as CreateEventType)}
                          className={`flex-1 rounded-md border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                          testID={`${testIDPrefix}-type-${value}`}
                        >
                          <Text
                            className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    Custom events cover vacation, work, birthdays, holidays, and other non-plan
                    scheduling. Activity plan events schedule a training session from one of your
                    saved plans.
                  </Text>
                </View>
              ) : null}

              {mode === "create" &&
              createEventType === "planned" &&
              onChangeActivityPlanSearchQuery &&
              onSelectActivityPlan ? (
                <View className="gap-3">
                  <Text className="text-xs text-muted-foreground">Search activity plans</Text>
                  <Input
                    value={activityPlanSearchQuery}
                    onChangeText={onChangeActivityPlanSearchQuery}
                    placeholder="Search your activity plans"
                    testID={`${testIDPrefix}-activity-plan-search-input`}
                  />

                  {selectedCreateActivityPlan ? (
                    <View
                      className="rounded-md border border-primary bg-primary/5 px-3 py-3"
                      testID={`${testIDPrefix}-selected-activity-plan`}
                    >
                      <Text className="text-sm font-medium text-foreground">
                        {selectedCreateActivityPlan.name}
                      </Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        {formatActivityCategoryLabel(selectedCreateActivityPlan.activity_category)}
                        {formatDurationLabel(
                          getAuthoritativeActivityPlanMetrics(selectedCreateActivityPlan)
                            .estimated_duration,
                        )
                          ? ` · ${formatDurationLabel(getAuthoritativeActivityPlanMetrics(selectedCreateActivityPlan).estimated_duration)}`
                          : ""}
                      </Text>
                    </View>
                  ) : null}

                  {isLoadingActivityPlans ? (
                    <Text className="text-xs text-muted-foreground">Loading activity plans...</Text>
                  ) : activityPlansError ? (
                    <TouchableOpacity
                      onPress={onRetryActivityPlans}
                      activeOpacity={0.85}
                      testID={`${testIDPrefix}-activity-plan-retry`}
                    >
                      <Text className="text-xs text-primary">Retry loading activity plans</Text>
                    </TouchableOpacity>
                  ) : (filteredActivityPlans?.length ?? 0) > 0 ? (
                    <View className="gap-2">
                      {filteredActivityPlans?.slice(0, 8).map((plan) => {
                        const isSelected = plan.id === selectedActivityPlanId;
                        return (
                          <TouchableOpacity
                            key={plan.id}
                            onPress={() => onSelectActivityPlan(plan.id)}
                            activeOpacity={0.85}
                            className={`rounded-md border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                            testID={`${testIDPrefix}-activity-plan-option-${plan.id}`}
                          >
                            <Text className="text-sm font-medium text-foreground">{plan.name}</Text>
                            <Text className="mt-1 text-xs text-muted-foreground">
                              {formatActivityCategoryLabel(plan.activity_category)}
                              {formatDurationLabel(
                                getAuthoritativeActivityPlanMetrics(plan).estimated_duration,
                              )
                                ? ` · ${formatDurationLabel(getAuthoritativeActivityPlanMetrics(plan).estimated_duration)}`
                                : ""}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text className="text-xs text-muted-foreground">
                      No activity plans match that search yet.
                    </Text>
                  )}
                </View>
              ) : null}

              <Text className="text-xs text-muted-foreground">Title</Text>
              <Input
                value={eventTitle}
                onChangeText={onChangeEventTitle}
                placeholder="Event title"
                testID={`${testIDPrefix}-title-input`}
              />
              {mode === "create" && createEventType === "planned" ? (
                <Text className="text-xs text-muted-foreground">
                  Leave the title as-is to use the selected activity plan name, or customize it.
                </Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Text className="text-xs text-muted-foreground">Date</Text>
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                activeOpacity={0.8}
                onPress={() => setShowDatePicker(true)}
                testID={`${testIDPrefix}-date-button`}
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
                onCheckedChange={onChangeAllDay}
                testId={`${testIDPrefix}-all-day-switch`}
              />
            </View>

            {!allDay ? (
              <TouchableOpacity
                className="rounded-md border border-border bg-card px-3 py-3"
                activeOpacity={0.8}
                onPress={() => setShowTimePicker(true)}
                testID={`${testIDPrefix}-time-button`}
              >
                <Text className="text-sm text-foreground">{format(startsAt, "h:mm a")}</Text>
              </TouchableOpacity>
            ) : null}

            <View className="gap-2">
              <Text className="text-xs text-muted-foreground">Notes</Text>
              <Textarea
                value={notes}
                onChangeText={onChangeNotes}
                placeholder="Optional notes"
                testID={`${testIDPrefix}-notes-input`}
              />
            </View>
          </View>

          {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}

          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={onCancel}
              disabled={isPending}
              testID={`${testIDPrefix}-cancel-button`}
            >
              <Text>Cancel</Text>
            </Button>
            <Button
              className="flex-1"
              onPress={onSubmit}
              disabled={isPending}
              testID={`${testIDPrefix}-save-button`}
            >
              <Text className="text-primary-foreground">{submitLabel}</Text>
            </Button>
          </View>
        </CardContent>
      </Card>

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
            onChangeStartsAt(next);
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
            onChangeStartsAt(next);
          }}
        />
      ) : null}
    </>
  );
}
