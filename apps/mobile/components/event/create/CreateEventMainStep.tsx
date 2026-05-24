import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { DateInput } from "@repo/ui/components/date-input";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { TimeInput } from "@repo/ui/components/time-input";
import { format } from "date-fns";
import { X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import type { ActivityPlanListItem, EventRecurrenceFrequency } from "../EventEditorCard";
import { type CreateEventDraft, type CreateEventMode, toDateOnly } from "./createEventDraft";

function applyDateOnlyToDate(current: Date, dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(current);
  next.setFullYear(
    year ?? current.getFullYear(),
    (month ?? current.getMonth() + 1) - 1,
    day ?? current.getDate(),
  );
  return next;
}

function repeatLabel(frequency: EventRecurrenceFrequency, endDate: string | null) {
  if (frequency === "none") return "Never";
  const cadence =
    frequency === "daily" ? "Every day" : frequency === "weekly" ? "Every week" : "Every month";
  return endDate ? `${cadence} until ${endDate}` : `${cadence} · choose end date`;
}

function SummaryRow({
  label,
  onPress,
  testID,
  value,
}: {
  label: string;
  onPress?: () => void;
  testID?: string;
  value: string;
}) {
  const content = (
    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      <Text className="shrink text-right text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} testID={testID}>
      {content}
    </Pressable>
  );
}

export function CreateEventMainStep({
  draft,
  formErrorMessage,
  helperText,
  isPending,
  onCancel,
  onChangeDraft,
  onChangeMode,
  onOpenActivityPlan,
  onRemoveActivityPlan,
  onOpenRepeat,
  onSubmit,
  selectedActivityPlan,
  showFooterActions = true,
  testIDPrefix,
  titleErrorMessage,
}: {
  draft: CreateEventDraft;
  formErrorMessage?: string | null;
  helperText?: string | null;
  isPending: boolean;
  onCancel: () => void;
  onChangeDraft: (draft: CreateEventDraft) => void;
  onChangeMode: (mode: CreateEventMode) => void;
  onOpenActivityPlan: () => void;
  onRemoveActivityPlan?: () => void;
  onOpenRepeat: () => void;
  onSubmit: () => void;
  selectedActivityPlan: ActivityPlanListItem | null;
  showFooterActions?: boolean;
  testIDPrefix: string;
  titleErrorMessage?: string | null;
}) {
  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-4 p-4">
        <View className="gap-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Create Event
          </Text>
          <Text className="text-2xl font-semibold text-foreground">
            {draft.mode === "planned" ? "Schedule activity" : "Create custom event"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Add only the details that matter for this event type.
          </Text>
        </View>

        <View className="flex-row gap-2">
          {[
            ["custom", "Custom event"],
            ["planned", "Activity plan"],
          ].map(([value, label]) => {
            const isSelected = draft.mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => onChangeMode(value as CreateEventMode)}
                className={`flex-1 rounded-2xl border px-3 py-3 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-card"}`}
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

        {draft.mode === "planned" ? (
          <>
            <View className="gap-2" testID={`${testIDPrefix}-activity-plan-row`}>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-xs font-medium text-muted-foreground">Activity Plan</Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={onOpenActivityPlan}
                    className="rounded-full border border-border px-3 py-1.5"
                    testID={`${testIDPrefix}-change-activity-plan-button`}
                  >
                    <Text className="text-xs font-semibold text-foreground">
                      {draft.activityPlanId ? "Change" : "Choose"}
                    </Text>
                  </Pressable>
                  {draft.activityPlanId && onRemoveActivityPlan ? (
                    <Pressable
                      accessibilityLabel="Detach activity plan"
                      onPress={onRemoveActivityPlan}
                      className="h-8 w-8 items-center justify-center rounded-full border border-border bg-background"
                      testID={`${testIDPrefix}-remove-activity-plan-button`}
                    >
                      <Icon as={X} size={14} className="text-muted-foreground" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {selectedActivityPlan ? (
                <ActivityPlanCard
                  activityPlan={selectedActivityPlan as any}
                  onPress={onOpenActivityPlan}
                  testID={`${testIDPrefix}-selected-activity-plan`}
                  variant="compact"
                />
              ) : (
                <Pressable
                  onPress={onOpenActivityPlan}
                  className="rounded-2xl border border-dashed border-border bg-muted/20 px-3 py-4"
                  testID={`${testIDPrefix}-choose-activity-plan-card`}
                >
                  <Text className="text-sm font-semibold text-foreground">Choose a plan</Text>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    Select the session to schedule for {draft.scheduledDate}.
                  </Text>
                </Pressable>
              )}
            </View>
            <DateInput
              accessibilityHint="Choose the scheduled activity date"
              id={`${testIDPrefix}-start-date`}
              label="Scheduled Date"
              onChange={(value) => {
                if (!value) return;
                onChangeDraft({ ...draft, scheduledDate: value });
              }}
              pickerPresentation="modal"
              testId={`${testIDPrefix}-start-date-button`}
              value={draft.scheduledDate}
            />
            <SummaryRow
              label="Repeat"
              onPress={onOpenRepeat}
              testID={`${testIDPrefix}-repeat-row`}
              value={repeatLabel(draft.recurrenceFrequency, draft.recurrenceEndDate)}
            />
            <View className="gap-2">
              <Text className="text-xs text-muted-foreground">Title</Text>
              <Input
                value={draft.title}
                onChangeText={(title) => onChangeDraft({ ...draft, title })}
                placeholder="Activity title"
                testID={`${testIDPrefix}-title-input`}
              />
            </View>
          </>
        ) : (
          <>
            <View className="gap-2">
              <Text className="text-xs text-muted-foreground">Title</Text>
              <Input
                value={draft.title}
                onChangeText={(title) => onChangeDraft({ ...draft, title })}
                placeholder="Event title"
                testID={`${testIDPrefix}-title-input`}
              />
            </View>
            <DateInput
              accessibilityHint="Choose when this event starts"
              id={`${testIDPrefix}-start-date`}
              label="Starts"
              onChange={(value) => {
                if (!value) return;
                onChangeDraft({ ...draft, startsAt: applyDateOnlyToDate(draft.startsAt, value) });
              }}
              pickerPresentation="modal"
              testId={`${testIDPrefix}-start-date-button`}
              value={toDateOnly(draft.startsAt)}
            />
            {!draft.allDay ? (
              <TimeInput
                accessibilityHint="Choose when this event starts"
                id={`${testIDPrefix}-start-time`}
                label="Start time"
                onChange={(value) => {
                  if (!value) return;
                  const [hours, minutes] = value.split(":").map(Number);
                  const startsAt = new Date(draft.startsAt);
                  startsAt.setHours(
                    hours ?? startsAt.getHours(),
                    minutes ?? startsAt.getMinutes(),
                    0,
                    0,
                  );
                  onChangeDraft({ ...draft, startsAt });
                }}
                pickerPresentation="modal"
                testId={`${testIDPrefix}-start-time-button`}
                value={format(draft.startsAt, "HH:mm")}
              />
            ) : null}
            <View className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-3 py-3">
              <View>
                <Text className="text-sm font-medium text-foreground">All day</Text>
                <Text className="text-xs text-muted-foreground">Hide time for this event</Text>
              </View>
              <Switch
                checked={draft.allDay}
                onCheckedChange={(allDay) => onChangeDraft({ ...draft, allDay })}
                testId={`${testIDPrefix}-all-day-switch`}
              />
            </View>
            <SummaryRow
              label="Repeat"
              onPress={onOpenRepeat}
              testID={`${testIDPrefix}-repeat-row`}
              value={repeatLabel(draft.recurrenceFrequency, draft.recurrenceEndDate)}
            />
          </>
        )}

        {titleErrorMessage ? (
          <Text className="text-xs text-destructive">{titleErrorMessage}</Text>
        ) : null}

        <View className="gap-2">
          <Text className="text-xs text-muted-foreground">Notes</Text>
          <Textarea
            value={draft.notes}
            onChangeText={(notes) => onChangeDraft({ ...draft, notes })}
            placeholder="Optional notes"
            testID={`${testIDPrefix}-notes-input`}
          />
        </View>

        {formErrorMessage ? (
          <Text className="text-xs text-destructive">{formErrorMessage}</Text>
        ) : null}
        {helperText ? <Text className="text-xs text-muted-foreground">{helperText}</Text> : null}

        {showFooterActions ? (
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
              <Text className="text-primary-foreground">
                {isPending
                  ? "Creating..."
                  : draft.mode === "planned"
                    ? "Schedule Activity"
                    : "Create Event"}
              </Text>
            </Button>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}
