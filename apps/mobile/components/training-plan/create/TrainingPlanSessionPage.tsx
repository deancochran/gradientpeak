import type { ActivityPlanSummary as ActivityPlan, ActivityPlanMetric } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { TimeInput } from "@repo/ui/components/time-input";
import { useZodForm } from "@repo/ui/hooks";
import { useCallback, useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";

const titleSchema = z.object({ title: z.string() });

/** Scheduling an existing prescription, not authoring a second prescription. */
export function TrainingPlanSessionPage({
  session,
  activityPlan,
  projectionMetrics,
  onChange,
  onChangeActivity,
}: {
  session: TrainingPlanBuilderSession;
  activityPlan: ActivityPlan | null;
  projectionMetrics?: readonly ActivityPlanMetric[] | undefined;
  onChange: (session: TrainingPlanBuilderSession) => void;
  onChangeActivity: (sessionId: string) => void;
}) {
  const [showOptional, setShowOptional] = useState(
    Boolean(session.eventOverrides?.title || session.eventOverrides?.start_time),
  );
  const form = useZodForm({
    schema: titleSchema,
    defaultValues: { title: session.eventOverrides?.title ?? "" },
  });
  const title = useWatch({ control: form.control, name: "title" });
  const updateOverride = useCallback(
    (field: "title" | "start_time", value: string) => {
      const overrides = { ...session.eventOverrides };
      if (value) overrides[field] = value;
      else delete overrides[field];
      const { eventOverrides: _previous, ...rest } = session;
      onChange(Object.keys(overrides).length ? { ...rest, eventOverrides: overrides } : rest);
    },
    [session, onChange],
  );
  useEffect(() => {
    if (title !== (session.eventOverrides?.title ?? "")) updateOverride("title", title);
  }, [title, session.eventOverrides?.title, updateOverride]);
  const week = Math.floor(session.offsetDays / 7);
  const day = session.offsetDays % 7;
  const metrics = projectionMetrics ?? activityPlan?.metrics;
  const hasEstimates = metrics?.some((metric) => metric.status === "available") ?? false;

  return (
    <View className="gap-5" testID="builder-simple-session">
      <ActivityPlanSummary
        title={activityPlan?.name ?? session.activityPlan?.name ?? "Activity unavailable"}
        subtitle={activityPlan?.activityCategory ?? session.demand.activity_category}
        {...(hasEstimates && metrics ? { projectionMetrics: metrics } : {})}
        showAttribution={false}
        headerAccessory={
          <Button
            accessibilityLabel="Change activity"
            onPress={() => onChangeActivity(session.localId)}
            size="sm"
            variant="ghost"
          >
            <Text>Change</Text>
          </Button>
        }
      />
      {!hasEstimates ? (
        <Text className="text-sm text-muted-foreground">
          Estimates aren’t available for this activity yet.
        </Text>
      ) : null}
      {hasEstimates && metrics?.some((metric) => metric.status !== "available") ? (
        <Text className="text-sm text-muted-foreground">
          Some estimates aren’t available yet. Missing estimates are shown as —.
        </Text>
      ) : null}
      <View className="gap-3">
        <Text className="text-base font-semibold">Schedule</Text>
        <View className="flex-row items-center justify-between gap-3">
          <Button
            accessibilityLabel="Previous week"
            disabled={week === 0}
            onPress={() => onChange({ ...session, offsetDays: session.offsetDays - 7 })}
            size="sm"
            variant="outline"
          >
            <Text>−</Text>
          </Button>
          <Text accessibilityLabel={`Week ${week + 1}`} className="text-base font-semibold">
            Week {week + 1}
          </Text>
          <Button
            accessibilityLabel="Next week"
            onPress={() => onChange({ ...session, offsetDays: session.offsetDays + 7 })}
            size="sm"
            variant="outline"
          >
            <Text>+</Text>
          </Button>
        </View>
        <Text className="text-sm text-muted-foreground">Day</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Activity day"
          className="flex-row flex-wrap gap-2"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((dayNumber) => (
            <Pressable
              key={dayNumber}
              accessibilityRole="radio"
              accessibilityLabel={`Day ${dayNumber}`}
              accessibilityState={{ checked: day === dayNumber - 1 }}
              className={`min-h-11 min-w-11 flex-1 items-center justify-center rounded-xl border p-2 ${day === dayNumber - 1 ? "border-primary bg-primary/10" : "border-border"}`}
              onPress={() => onChange({ ...session, offsetDays: week * 7 + dayNumber - 1 })}
            >
              <Text className="text-base">{dayNumber}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Button
        accessibilityState={{ expanded: showOptional }}
        onPress={() => setShowOptional(!showOptional)}
        variant="ghost"
      >
        <Text>{showOptional ? "Hide optional details" : "Optional details"}</Text>
      </Button>
      {showOptional ? (
        <Form {...form}>
          <View className="gap-4">
            <FormTextField
              control={form.control}
              label="Custom title"
              name="title"
              placeholder="Use activity name"
              testId="builder-session-custom-title"
            />
            <TimeInput
              id="builder-session-clock"
              testId="builder-session-clock"
              label="Start time (optional)"
              clearable
              is24Hour
              {...(session.eventOverrides?.start_time
                ? { value: session.eventOverrides.start_time }
                : {})}
              onChange={(value) => updateOverride("start_time", value ?? "")}
            />
          </View>
        </Form>
      ) : null}
    </View>
  );
}
