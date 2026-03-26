import {
  formatDurationV2,
  formatTargetValue,
  type IntensityTargetV2,
  type IntervalV2,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CircleAlert, Minus, Plus, Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { getDurationMs } from "@/lib/utils/durationConversion";

interface IntervalIssueSummary {
  interval: number;
  step: number;
  total: number;
}

interface StructureIntervalSheetProps {
  interval: IntervalV2;
  intervalIndex: number;
  intervalIssue?: IntervalIssueSummary;
  stepIssueCounts: Record<string, number>;
  onAdjustRepetitions: (delta: -1 | 1) => void;
  onAddStep: () => void;
  onDuplicateInterval: () => void;
  onDeleteInterval: () => void;
  onDeleteStep: (stepId: string) => void;
  onEditStep: (stepId: string) => void;
}

export function StructureIntervalSheet({
  interval,
  intervalIndex,
  intervalIssue,
  stepIssueCounts,
  onAdjustRepetitions,
  onAddStep,
  onDuplicateInterval,
  onDeleteInterval,
  onDeleteStep,
  onEditStep,
}: StructureIntervalSheetProps) {
  const totalMinutes = Math.round(
    interval.steps.reduce((sum, step) => sum + getDurationMs(step.duration), 0) / 60000,
  );

  const primaryTargets = interval.steps
    .map((step) => step.targets?.[0])
    .filter((target): target is IntensityTargetV2 => !!target);

  const summaryTarget = (() => {
    if (primaryTargets.length === 0) {
      return null;
    }

    const [firstTarget] = primaryTargets;
    const usesSingleType = primaryTargets.every((target) => target.type === firstTarget.type);

    if (!usesSingleType) {
      return formatTargetValue(firstTarget);
    }

    const averageIntensity =
      primaryTargets.reduce((sum, target) => sum + target.intensity, 0) / primaryTargets.length;

    return formatTargetValue({
      type: firstTarget.type,
      intensity: averageIntensity,
    });
  })();

  const intervalSummary = `${interval.steps.length} steps over ${totalMinutes} min per repeat, repeated x${interval.repetitions}${summaryTarget ? ` around ${summaryTarget}` : ""}.`;

  return (
    <View className="px-4 pt-2 pb-6 gap-3">
      <View className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <Text className="text-sm font-medium text-primary">
          Interval {intervalIndex + 1}: {interval.name || "Untitled interval"}
        </Text>
        <Text className="mt-1 text-[11px] text-muted-foreground">{intervalSummary}</Text>
        {intervalIssue && intervalIssue.total > 0 ? (
          <View className="mt-1 flex-row items-center gap-1">
            <CircleAlert size={12} color="#DC2626" />
            <Text className="text-[11px] text-destructive">
              {intervalIssue.total} issue{intervalIssue.total === 1 ? "" : "s"} in this interval
            </Text>
          </View>
        ) : null}
      </View>

      <View className="rounded-md border border-border bg-background px-2 py-2">
        <TimelineChart
          structure={{
            version: 2,
            intervals: [{ ...interval, repetitions: 1 }],
          }}
          height={72}
          compact
          onStepPress={(stepIndex) => {
            const step = interval.steps[stepIndex];
            if (step) {
              onEditStep(step.id);
            }
          }}
        />
      </View>

      <View className="flex-row items-center gap-2">
        <Text className="text-xs text-muted-foreground">Repeats</Text>
        <Button variant="ghost" size="sm" onPress={() => onAdjustRepetitions(-1)}>
          <Icon as={Minus} size={14} className="text-foreground" />
        </Button>
        <Text className="text-sm font-medium">{interval.repetitions}</Text>
        <Button variant="ghost" size="sm" onPress={() => onAdjustRepetitions(1)}>
          <Icon as={Plus} size={14} className="text-foreground" />
        </Button>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onPress={onAddStep}>
          <Text>+ Add Step</Text>
        </Button>
        <Button variant="ghost" size="sm" onPress={onDuplicateInterval}>
          <Text className="text-muted-foreground">Duplicate Interval</Text>
        </Button>
        <Button variant="ghost" size="sm" onPress={onDeleteInterval}>
          <Text className="text-destructive">Delete Interval</Text>
        </Button>
      </View>

      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">Steps</Text>
        {interval.steps.map((step, index) => (
          <Pressable
            key={step.id}
            className={`min-h-11 rounded-md border px-2.5 py-2 ${
              (stepIssueCounts[step.id] ?? 0) > 0
                ? "border-destructive/70 bg-destructive/5"
                : "border-border"
            }`}
            onPress={() => onEditStep(step.id)}
            accessibilityRole="button"
            accessibilityLabel={`Step ${index + 1}${(stepIssueCounts[step.id] ?? 0) > 0 ? `, ${stepIssueCounts[step.id] ?? 0} issue${(stepIssueCounts[step.id] ?? 0) === 1 ? "" : "s"}` : ""}`}
            accessibilityHint="Opens step editor"
          >
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <Text className="text-sm" numberOfLines={1}>
                  {step.name || `Step ${index + 1}`}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  {(stepIssueCounts[step.id] ?? 0) > 0 ? (
                    <>
                      <CircleAlert size={11} color="#DC2626" />
                      <Text className="text-[11px] text-destructive">
                        {stepIssueCounts[step.id] ?? 0} issue
                        {(stepIssueCounts[step.id] ?? 0) === 1 ? "" : "s"}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-[11px] text-muted-foreground">
                      {formatDurationV2(step.duration)}
                      {step.targets?.[0] ? ` at ${formatTargetValue(step.targets[0])}` : ""}
                    </Text>
                  )}
                </View>
              </View>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-11"
                onPress={() => onDeleteStep(step.id)}
                accessibilityLabel={`Delete step ${index + 1}`}
                accessibilityHint="Deletes step and shows undo"
              >
                <Icon as={Trash2} size={14} className="text-destructive" />
              </Button>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
