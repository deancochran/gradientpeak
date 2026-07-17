import { type ActivityPlanInterval, type ActivityPlanIntervalStep, Duration } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { ChevronDown, ChevronRight, Copy, GripVertical, X } from "lucide-react-native";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, View } from "react-native";
import { NestableDraggableFlatList, type RenderItemParams } from "react-native-draggable-flatlist";
import { z } from "zod";
import { getDurationMs } from "@/lib/utils/durationConversion";

interface StructureDetailsPanelProps {
  intervals: ActivityPlanInterval[];
  expandedIntervalIds: string[];
  validationErrors: Record<string, string | undefined>;
  onToggleIntervalExpanded: (intervalId: string) => void;
  onChangeIntervalRepetitions: (interval: ActivityPlanInterval, value: number) => void;
  onUpdateInterval: (intervalId: string, interval: ActivityPlanInterval) => void;
  onCopyInterval: (intervalId: string) => void;
  onRemoveInterval: (intervalId: string) => void;
  onReorderStepsInInterval: (intervalId: string, steps: ActivityPlanIntervalStep[]) => void;
  onEditStep: (intervalId: string, stepId: string) => void;
  onCopyStepInInterval: (intervalId: string, stepId: string) => void;
  onDeleteStepFromInterval: (intervalId: string, stepId: string) => void;
  onOpenAddStepDialog: (intervalId: string) => void;
  onQuickAddStep: (intervalId: string) => void;
  onSelectInterval: (intervalId: string) => void;
}

type IntervalNameFormValues = {
  name: string;
};

const intervalNameSchema = z.object({ name: z.string() });

type IntervalNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/** Keeps the interval structure authoritative while standardizing its editable name field. */
function IntervalNameField({ value, onChange }: IntervalNameFieldProps) {
  const form = useZodForm<IntervalNameFormValues>({
    schema: intervalNameSchema,
    values: { name: value },
  });
  const name = useWatch({ control: form.control, name: "name" });

  useEffect(() => {
    if (name !== value) {
      onChange(name);
    }
  }, [name, onChange, value]);

  return (
    <Form {...form}>
      <FormTextField
        control={form.control}
        label="Interval name"
        name="name"
        placeholder="Interval name"
      />
    </Form>
  );
}

export function StructureDetailsPanel({
  intervals,
  expandedIntervalIds,
  validationErrors,
  onToggleIntervalExpanded,
  onChangeIntervalRepetitions,
  onUpdateInterval,
  onCopyInterval,
  onRemoveInterval,
  onReorderStepsInInterval,
  onEditStep,
  onCopyStepInInterval,
  onDeleteStepFromInterval,
  onOpenAddStepDialog,
  onQuickAddStep,
  onSelectInterval,
}: StructureDetailsPanelProps) {
  return (
    <View className="border border-border rounded-lg p-3 gap-2 bg-background">
      <View className="gap-3">
        {intervals.map((interval) => {
          const isExpanded = expandedIntervalIds.includes(interval.id);
          const intervalRepeatError = validationErrors[`interval:${interval.id}:repetitions`];
          const intervalStepsError = validationErrors[`interval:${interval.id}:steps`];
          const intervalDurationMinutes = Math.round(
            interval.steps.reduce((total, step) => {
              return total + getDurationMs(step.duration) / 60000;
            }, 0) * interval.repetitions,
          );

          return (
            <View key={interval.id} className="border border-border rounded-lg p-3 gap-3 bg-card">
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => onToggleIntervalExpanded(interval.id)} className="py-2">
                  <Icon
                    as={isExpanded ? ChevronDown : ChevronRight}
                    size={16}
                    className="text-muted-foreground"
                  />
                </Pressable>

                <Pressable className="flex-1" onPress={() => onSelectInterval(interval.id)}>
                  <Text className="font-medium" numberOfLines={1}>
                    {interval.name || "Untitled interval"}
                  </Text>
                  <Text className="text-xs text-muted-foreground mt-1">
                    {interval.steps.length} steps - {intervalDurationMinutes} min
                  </Text>
                </Pressable>

                <View className="w-40">
                  <IntegerStepper
                    error={intervalRepeatError}
                    label="Repetitions"
                    max={50}
                    min={1}
                    onChange={(value) => onChangeIntervalRepetitions(interval, value)}
                    value={interval.repetitions}
                  />
                </View>
                <Text className="text-xs text-muted-foreground">x</Text>
              </View>

              {intervalStepsError ? (
                <Text className="text-xs text-destructive">{intervalStepsError}</Text>
              ) : null}

              {isExpanded ? (
                <View className="gap-3">
                  <IntervalNameField
                    value={interval.name}
                    onChange={(name) =>
                      onUpdateInterval(interval.id, {
                        ...interval,
                        name,
                      })
                    }
                  />

                  <View className="flex-row items-center justify-end">
                    <View className="flex-row items-center gap-1">
                      <Button variant="ghost" size="sm" onPress={() => onCopyInterval(interval.id)}>
                        <Icon as={Copy} size={14} className="text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => onRemoveInterval(interval.id)}
                      >
                        <Icon as={X} size={14} className="text-destructive" />
                      </Button>
                    </View>
                  </View>

                  <NestableDraggableFlatList
                    data={interval.steps}
                    keyExtractor={(step) => step.id}
                    scrollEnabled={false}
                    onDragEnd={({ data }) => onReorderStepsInInterval(interval.id, data)}
                    renderItem={({
                      item: step,
                      drag: dragStep,
                      getIndex,
                    }: RenderItemParams<ActivityPlanIntervalStep>) => {
                      const stepIndex = getIndex?.() ?? 0;
                      const durationError =
                        validationErrors[`step:${interval.id}:${step.id}:duration`];
                      const targetError = validationErrors[`step:${interval.id}:${step.id}:target`];

                      return (
                        <Pressable
                          className="border border-border rounded-md px-2.5 py-2 bg-background mt-1.5"
                          onPress={() => onEditStep(interval.id, step.id)}
                        >
                          <View className="flex-row items-center justify-between gap-2">
                            <View className="flex-1 pr-2">
                              <Text className="text-sm font-medium" numberOfLines={1}>
                                {step.name || `Step ${stepIndex + 1}`}
                              </Text>
                              <Text className="text-[11px] text-muted-foreground mt-0.5">
                                {Duration.formatDuration(step.duration)}
                                {step.targets?.[0] ? " - " : ""}
                                {step.targets?.[0]
                                  ? `${step.targets[0].type} ${step.targets[0].intensity}`
                                  : "No target set"}
                              </Text>
                            </View>
                            <View className="flex-row items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onPress={() => onCopyStepInInterval(interval.id, step.id)}
                              >
                                <Icon as={Copy} size={14} className="text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onPress={() => onDeleteStepFromInterval(interval.id, step.id)}
                              >
                                <Icon as={X} size={14} className="text-destructive" />
                              </Button>
                              <Pressable onLongPress={dragStep} className="px-1 py-2">
                                <Icon
                                  as={GripVertical}
                                  size={14}
                                  className="text-muted-foreground"
                                />
                              </Pressable>
                            </View>
                          </View>

                          {durationError ? (
                            <Text className="text-xs text-destructive mt-1">{durationError}</Text>
                          ) : null}
                          {targetError ? (
                            <Text className="text-xs text-destructive mt-1">{targetError}</Text>
                          ) : null}
                        </Pressable>
                      );
                    }}
                    ListFooterComponent={
                      <View className="mt-3 flex-row items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => onOpenAddStepDialog(interval.id)}
                        >
                          <Text>+ Add Step</Text>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => onQuickAddStep(interval.id)}
                        >
                          <Text className="text-muted-foreground">Quick add</Text>
                        </Button>
                      </View>
                    }
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
