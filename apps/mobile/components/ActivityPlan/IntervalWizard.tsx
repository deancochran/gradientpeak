import type {
  IntensityTargetV2,
  IntervalStepV2,
  IntervalV2,
} from "@repo/core/schemas/activity_plan_v2";
import { Button } from "@repo/ui/components/button";
import { Form, FormNumberField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { z } from "zod";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { convertUIToV2Duration } from "@/lib/utils/durationConversion";

interface IntervalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (interval: IntervalV2) => void;
  defaultSegmentName?: string;
}

interface IntervalConfig {
  segmentName: string;
  repeatCount: number;
  workName: string;
  workDuration: number;
  workUnit: "seconds" | "minutes";
  workIntensity: number;
  restName: string;
  restDuration: number;
  restUnit: "seconds" | "minutes";
  restIntensity: number;
}

const intervalWizardSchema = z.object({
  segmentName: z.string().trim().min(1, "Enter a segment name"),
  repeatCount: z.number().int().min(1, "Add at least one repeat"),
  workName: z.string().trim().min(1, "Enter a work step name"),
  workDuration: z.number().positive("Enter a valid work duration"),
  workUnit: z.enum(["seconds", "minutes"]),
  workIntensity: z.number().positive("Enter a valid work intensity"),
  restName: z.string().trim().min(1, "Enter a rest step name"),
  restDuration: z.number().positive("Enter a valid rest duration"),
  restUnit: z.enum(["seconds", "minutes"]),
  restIntensity: z.number().positive("Enter a valid rest intensity"),
});

type IntervalWizardValues = z.infer<typeof intervalWizardSchema>;

export function IntervalWizard({
  open,
  onOpenChange,
  onSave,
  defaultSegmentName,
}: IntervalWizardProps) {
  const [config, setConfig] = useState<IntervalConfig>({
    segmentName: defaultSegmentName || "Intervals",
    repeatCount: 5,
    workName: "Work",
    workDuration: 2,
    workUnit: "minutes",
    workIntensity: 95,
    restName: "Rest",
    restDuration: 1,
    restUnit: "minutes",
    restIntensity: 50,
  });
  const form = useZodForm({
    schema: intervalWizardSchema,
    defaultValues: config,
  });

  useEffect(() => {
    if (open && defaultSegmentName) {
      const next = { ...form.getValues(), segmentName: defaultSegmentName } as IntervalWizardValues;
      setConfig(next);
      form.reset(next);
    }
  }, [defaultSegmentName, form, open]);

  useEffect(() => {
    form.reset(config);
  }, [config, form]);

  const values = form.watch() as IntervalWizardValues;

  const workDurationSeconds =
    values.workUnit === "minutes" ? values.workDuration * 60 : values.workDuration;
  const restDurationSeconds =
    values.restUnit === "minutes" ? values.restDuration * 60 : values.restDuration;

  const intervalDuration = workDurationSeconds + restDurationSeconds;
  const totalDuration = intervalDuration * values.repeatCount;
  const totalSteps = values.repeatCount * 2;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    return `${secs}s`;
  };

  const handleSave = (nextConfig: IntervalWizardValues) => {
    const steps: IntervalStepV2[] = [];

    steps.push({
      id: require("expo-crypto").randomUUID(),
      name: nextConfig.workName,
      duration: convertUIToV2Duration({
        type: "time",
        value: nextConfig.workDuration,
        unit: nextConfig.workUnit,
      }),
      targets: [
        {
          type: "%FTP",
          intensity: nextConfig.workIntensity,
        } as IntensityTargetV2,
      ],
    });

    steps.push({
      id: require("expo-crypto").randomUUID(),
      name: nextConfig.restName,
      duration: convertUIToV2Duration({
        type: "time",
        value: nextConfig.restDuration,
        unit: nextConfig.restUnit,
      }),
      targets: [
        {
          type: "%FTP",
          intensity: nextConfig.restIntensity,
        } as IntensityTargetV2,
      ],
    });

    const interval: IntervalV2 = {
      id: require("expo-crypto").randomUUID(),
      name: nextConfig.segmentName,
      repetitions: nextConfig.repeatCount,
      steps: steps,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(interval);
    onOpenChange(false);
  };

  // SVG Preview dimensions
  const previewWidth = 320;
  const previewHeight = 100;
  const barHeight = 40;

  // Calculate bar widths proportionally
  const safeIntervalDuration = intervalDuration > 0 ? intervalDuration : 1;
  const workPercent = workDurationSeconds / safeIntervalDuration;
  const restPercent = restDurationSeconds / safeIntervalDuration;

  const getIntensityColor = (intensity: number): string => {
    if (intensity >= 106) return "#dc2626"; // Z5 - Red
    if (intensity >= 91) return "#ea580c"; // Z4 - Orange
    if (intensity >= 76) return "#ca8a04"; // Z3 - Yellow
    if (intensity >= 56) return "#16a34a"; // Z2 - Green
    return "#06b6d4"; // Z1 - Light Blue
  };

  if (!open) {
    return null;
  }

  const submitForm = useZodFormSubmit<IntervalWizardValues>({
    form,
    onSubmit: handleSave,
  });

  return (
    <AppFormModal
      description="Configure the interval pattern, work/rest durations, and intensity before adding it to the workout."
      onClose={() => onOpenChange(false)}
      primaryAction={
        <Button onPress={submitForm.handleSubmit} testID="interval-wizard-save-button">
          <Text className="text-primary-foreground font-semibold">Create Intervals</Text>
        </Button>
      }
      secondaryAction={
        <Button
          onPress={() => onOpenChange(false)}
          variant="outline"
          testID="interval-wizard-cancel-button"
        >
          <Text className="text-foreground font-medium">Cancel</Text>
        </Button>
      }
      testID="interval-wizard-modal"
      title="Create Intervals"
    >
      <Form {...form}>
        <View className="gap-4">
          <FormTextField
            control={form.control}
            label="Segment Name"
            name="segmentName"
            placeholder="e.g., Intervals, Main Set"
            required
          />

          <FormNumberField
            control={form.control}
            label="Number of Repeats"
            name="repeatCount"
            allowDecimal={false}
            min={1}
            placeholder="5"
            required
          />

          <View className="rounded-lg border border-border bg-muted/30 p-4">
            <Text className="mb-3 text-base font-semibold">Work Phase</Text>

            <View className="gap-3">
              <FormTextField
                control={form.control}
                label="Work Name"
                name="workName"
                placeholder="Work"
                required
              />

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <FormNumberField
                    control={form.control}
                    label="Duration"
                    name="workDuration"
                    min={0.01}
                    placeholder="2"
                    required
                  />
                </View>
                <View className="w-28 gap-2">
                  <Text className="text-sm font-medium text-foreground">Unit</Text>
                  <View className="flex-row gap-1">
                    <Button
                      variant={values.workUnit === "seconds" ? "default" : "outline"}
                      size="sm"
                      onPress={() => form.setValue("workUnit", "seconds", { shouldDirty: true })}
                      className="flex-1"
                    >
                      <Text
                        className={
                          values.workUnit === "seconds"
                            ? "text-primary-foreground text-xs"
                            : "text-xs"
                        }
                      >
                        sec
                      </Text>
                    </Button>
                    <Button
                      variant={values.workUnit === "minutes" ? "default" : "outline"}
                      size="sm"
                      onPress={() => form.setValue("workUnit", "minutes", { shouldDirty: true })}
                      className="flex-1"
                    >
                      <Text
                        className={
                          values.workUnit === "minutes"
                            ? "text-primary-foreground text-xs"
                            : "text-xs"
                        }
                      >
                        min
                      </Text>
                    </Button>
                  </View>
                </View>
              </View>

              <FormNumberField
                control={form.control}
                label="Intensity (% FTP)"
                name="workIntensity"
                min={1}
                placeholder="95"
                required
              />
            </View>
          </View>

          <View className="rounded-lg border border-border bg-muted/30 p-4">
            <Text className="mb-3 text-base font-semibold">Rest Phase</Text>

            <View className="gap-3">
              <FormTextField
                control={form.control}
                label="Rest Name"
                name="restName"
                placeholder="Rest"
                required
              />

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <FormNumberField
                    control={form.control}
                    label="Duration"
                    name="restDuration"
                    min={0.01}
                    placeholder="1"
                    required
                  />
                </View>
                <View className="w-28 gap-2">
                  <Text className="text-sm font-medium text-foreground">Unit</Text>
                  <View className="flex-row gap-1">
                    <Button
                      variant={values.restUnit === "seconds" ? "default" : "outline"}
                      size="sm"
                      onPress={() => form.setValue("restUnit", "seconds", { shouldDirty: true })}
                      className="flex-1"
                    >
                      <Text
                        className={
                          values.restUnit === "seconds"
                            ? "text-primary-foreground text-xs"
                            : "text-xs"
                        }
                      >
                        sec
                      </Text>
                    </Button>
                    <Button
                      variant={values.restUnit === "minutes" ? "default" : "outline"}
                      size="sm"
                      onPress={() => form.setValue("restUnit", "minutes", { shouldDirty: true })}
                      className="flex-1"
                    >
                      <Text
                        className={
                          values.restUnit === "minutes"
                            ? "text-primary-foreground text-xs"
                            : "text-xs"
                        }
                      >
                        min
                      </Text>
                    </Button>
                  </View>
                </View>
              </View>

              <FormNumberField
                control={form.control}
                label="Intensity (% FTP)"
                name="restIntensity"
                min={1}
                placeholder="50"
                required
              />
            </View>
          </View>

          <View className="rounded-lg border border-border bg-background p-4">
            <Text className="mb-3 text-base font-semibold">Preview</Text>

            <View className="mb-4 flex-row justify-between">
              <View>
                <Text className="text-xs text-muted-foreground">Total Steps</Text>
                <Text className="text-lg font-semibold">{totalSteps}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Interval Duration</Text>
                <Text className="text-lg font-semibold">{formatTime(intervalDuration)}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Total Duration</Text>
                <Text className="text-lg font-semibold">{formatTime(totalDuration)}</Text>
              </View>
            </View>

            <View>
              <Text className="mb-2 text-xs text-muted-foreground">Interval Pattern</Text>
              <Svg width={previewWidth} height={previewHeight}>
                <Rect
                  x="0"
                  y={(previewHeight - barHeight) / 2}
                  width={previewWidth * workPercent}
                  height={barHeight}
                  fill={getIntensityColor(values.workIntensity)}
                  rx="4"
                />
                <SvgText
                  x={(previewWidth * workPercent) / 2}
                  y={previewHeight / 2}
                  fontSize="12"
                  fill="white"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontWeight="600"
                >
                  {values.workName}
                </SvgText>

                <Rect
                  x={previewWidth * workPercent}
                  y={(previewHeight - barHeight) / 2}
                  width={previewWidth * restPercent}
                  height={barHeight}
                  fill={getIntensityColor(values.restIntensity)}
                  rx="4"
                />
                <SvgText
                  x={previewWidth * workPercent + (previewWidth * restPercent) / 2}
                  y={previewHeight / 2}
                  fontSize="12"
                  fill="white"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontWeight="600"
                >
                  {values.restName}
                </SvgText>
              </Svg>

              <Text className="mt-2 text-center text-xs text-muted-foreground">
                This pattern will repeat {values.repeatCount} time
                {values.repeatCount !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
      </Form>
    </AppFormModal>
  );
}
