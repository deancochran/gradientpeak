import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { View } from "react-native";
import type { TrainingPlanSchedulingPreview } from "@/lib/training-plan-creation/scheduling-preview";
import type { TrainingPlanBuilderState } from "@/lib/training-plan-creation/types";

const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

type BuilderSchedulePreviewContentProps = {
  preview: TrainingPlanSchedulingPreview;
  state: TrainingPlanBuilderState;
  onClearSessionOverride: (sessionId: string) => void;
  onMoveSessionByDays: (sessionId: string, currentDate: string, days: number) => void;
  onTogglePreferredWeekday: (weekday: number) => void;
};

export function BuilderSchedulePreviewContent({
  onClearSessionOverride,
  onMoveSessionByDays,
  onTogglePreferredWeekday,
  preview,
  state,
}: BuilderSchedulePreviewContentProps) {
  const preferredWeekdays = new Set(state.scheduling.preferredWeekdays);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="text-sm font-semibold text-foreground">Reusable week/day schedule</Text>
        <Text className="text-xs leading-4 text-muted-foreground">
          This builder uses relative weeks and days. Calendar anchoring stays internal until you
          apply the plan to a schedule.
        </Text>
      </View>

      <View className="gap-2 border-t border-border pt-4">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm font-semibold text-foreground">Preferred days</Text>
          <Text className="text-xs leading-4 text-muted-foreground">
            Conflicts highlight off-days.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {WEEKDAYS.map((weekday) => {
            const isActive = preferredWeekdays.has(weekday.value);
            return (
              <Button
                key={weekday.value}
                size="sm"
                variant={isActive ? "default" : "outline"}
                onPress={() => onTogglePreferredWeekday(weekday.value)}
              >
                <Text>{weekday.label}</Text>
              </Button>
            );
          })}
        </View>
      </View>

      <View className="gap-2 border-t border-border pt-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            {preview.checks.length > 0 ? (
              <AlertTriangle size={15} className="text-primary" />
            ) : (
              <CheckCircle2 size={15} className="text-primary" />
            )}
            <Text className="text-sm font-semibold text-foreground">Checks</Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {preview.checks.length > 0
              ? `${preview.checks.length} issue${preview.checks.length === 1 ? "" : "s"}`
              : "Clear"}
          </Text>
        </View>
        {preview.checks.length > 0 ? (
          <View className="gap-1">
            {preview.checks.slice(0, 5).map((check) => (
              <View
                key={`${check.code}-${check.sessionId ?? check.weekIndex ?? "all"}`}
                className="flex-row gap-2"
              >
                <Text className="text-xs leading-4 text-primary">•</Text>
                <Text className="flex-1 text-xs leading-4 text-muted-foreground">
                  {check.message}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs leading-4 text-muted-foreground">
            No local scheduling conflicts.
          </Text>
        )}
      </View>

      <View className="gap-2">
        {preview.weeks.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-border p-4">
            <Text className="text-center text-sm text-muted-foreground">
              Add sessions before previewing a schedule.
            </Text>
          </View>
        ) : (
          preview.weeks.map((week) => (
            <View
              key={week.weekIndex}
              className="gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-foreground">
                  Week {week.weekIndex + 1}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Days {week.weekIndex * 7 + 1}-{week.weekIndex * 7 + 7}
                </Text>
              </View>
              {week.sessions.map((previewSession, sessionIndex) => {
                const hasConflict = previewSession.conflictCodes.length > 0;
                const hasOverride = Boolean(
                  state.scheduling.sessionDateOverrides[previewSession.id],
                );
                return (
                  <View
                    key={previewSession.id}
                    className={
                      hasConflict
                        ? "gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5"
                        : sessionIndex > 0
                          ? "gap-2 border-t border-border/70 py-2.5"
                          : "gap-2 py-2.5"
                    }
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-semibold text-foreground">
                          {previewSession.label}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Day {previewSession.offsetDays + 1} ·{" "}
                          {WEEKDAYS.find((day) => day.value === previewSession.weekday)?.label}
                          {hasOverride ? " · moved" : ""}
                        </Text>
                      </View>
                      {hasConflict ? <AlertTriangle size={15} className="text-primary" /> : null}
                    </View>
                    <View className="flex-row flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          onMoveSessionByDays(previewSession.id, previewSession.date, -1)
                        }
                      >
                        <Text>Earlier</Text>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          onMoveSessionByDays(previewSession.id, previewSession.date, 1)
                        }
                      >
                        <Text>Later</Text>
                      </Button>
                      {hasOverride ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => onClearSessionOverride(previewSession.id)}
                        >
                          <Text>Reset</Text>
                        </Button>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
