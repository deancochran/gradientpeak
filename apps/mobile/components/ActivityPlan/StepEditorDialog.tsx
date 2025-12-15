import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

import type {
  PlanStepV2,
  IntensityTargetV2,
} from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import { Plus, Trash2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { Dimensions, ScrollView, View } from "react-native";
import { z } from "zod";

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: PlanStepV2;
  onSave: (step: PlanStepV2) => void;
  activityType?: string;
  defaultSegmentName?: string;
}

// Form schema for V2 step editing - uses V2 duration format directly
const formSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  description: z.string().optional(),
  segmentName: z.string().optional(),
  duration: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("time"),
      seconds: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("distance"),
      meters: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("repetitions"),
      count: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("untilFinished"),
    }),
  ]),
  targets: z
    .array(
      z.object({
        type: z.enum([
          "%FTP",
          "%MaxHR",
          "%ThresholdHR",
          "watts",
          "bpm",
          "speed",
          "cadence",
          "RPE",
        ]),
        intensity: z.number().min(0),
      }),
    )
    .max(3)
    .optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// Helper type for UI display - internal to component only
type DurationUI =
  | { type: "time"; value: number; unit: "seconds" | "minutes" | "hours" }
  | { type: "distance"; value: number; unit: "meters" | "km" }
  | { type: "repetitions"; value: number; unit: "reps" }
  | { type: "untilFinished" };

const DURATION_TYPES = [
  { value: "time", label: "Time-based" },
  { value: "distance", label: "Distance-based" },
  { value: "repetitions", label: "Repetitions" },
  { value: "untilFinished", label: "Until Finished" },
];

const TIME_UNITS = [
  { value: "seconds", label: "seconds" },
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
];

const DISTANCE_UNITS = [
  { value: "meters", label: "meters" },
  { value: "km", label: "km" },
];

const INTENSITY_TYPES = [
  { value: "%FTP", label: "% FTP" },
  { value: "%MaxHR", label: "% Max HR" },
  { value: "%ThresholdHR", label: "% Threshold HR" },
  { value: "watts", label: "Watts" },
  { value: "bpm", label: "BPM" },
  { value: "speed", label: "Speed (km/h)" },
  { value: "cadence", label: "Cadence (rpm)" },
  { value: "RPE", label: "RPE (1-10)" },
];

// Helper functions to convert between V2 format and UI display
function v2ToUIValue(duration: FormData["duration"]): {
  value: number;
  unit: string;
} {
  if (duration.type === "time") {
    const seconds = duration.seconds;
    if (seconds >= 3600 && seconds % 3600 === 0) {
      return { value: seconds / 3600, unit: "hours" };
    }
    if (seconds >= 60 && seconds % 60 === 0) {
      return { value: seconds / 60, unit: "minutes" };
    }
    return { value: seconds, unit: "seconds" };
  }
  if (duration.type === "distance") {
    const meters = duration.meters;
    if (meters >= 1000 && meters % 1000 === 0) {
      return { value: meters / 1000, unit: "km" };
    }
    return { value: meters, unit: "meters" };
  }
  if (duration.type === "repetitions") {
    return { value: duration.count, unit: "reps" };
  }
  return { value: 0, unit: "seconds" };
}

function uiToV2Value(
  type: "time" | "distance" | "repetitions",
  value: number,
  unit: string,
): number {
  if (type === "time") {
    if (unit === "hours") return Math.round(value * 3600);
    if (unit === "minutes") return Math.round(value * 60);
    return Math.round(value);
  }
  if (type === "distance") {
    if (unit === "km") return Math.round(value * 1000);
    return Math.round(value);
  }
  return Math.round(value); // repetitions
}

export function StepEditorDialog({
  open,
  onOpenChange,
  step,
  onSave,
  activityType,
  defaultSegmentName,
}: StepEditorDialogProps) {
  const isMountedRef = useRef(true);

  const form = useForm<FormData>({
    defaultValues: {
      name: "New Step",
      description: "",
      segmentName: defaultSegmentName || "",
      duration: { type: "time", seconds: 600 }, // 10 minutes in V2 format
      targets: [],
      notes: "",
    },
  });

  const durationType = form.watch("duration");
  const targets = form.watch("targets") || [];

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset form when dialog opens or step changes
  useEffect(() => {
    if (!isMountedRef.current) return;

    if (step) {
      // Editing existing step - use V2 duration directly
      form.reset({
        name: step.name || "",
        description: step.description || "",
        segmentName: step.segmentName || defaultSegmentName || "",
        duration: step.duration, // Already in V2 format
        targets: step.targets || [],
        notes: step.notes || "",
      });
    } else if (open) {
      // Creating new step - use V2 format
      form.reset({
        name: "New Step",
        description: "",
        segmentName: defaultSegmentName || "",
        duration: { type: "time", seconds: 600 }, // 10 minutes
        targets: [],
        notes: "",
      });
    }
  }, [step, form, open, defaultSegmentName]);

  const handleSave = () => {
    if (!isMountedRef.current) return;

    const values = form.getValues();
    const result = formSchema.safeParse(values);

    if (!result.success) {
      console.error("❌ Validation errors:", result.error.flatten());
      return;
    }

    // Create V2 step - duration is already in V2 format
    const stepV2: PlanStepV2 = {
      name: result.data.name,
      description: result.data.description,
      duration: result.data.duration, // Already in V2 format
      targets: result.data.targets as IntensityTargetV2[],
      segmentName: result.data.segmentName,
      notes: result.data.notes,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(stepV2);
    onOpenChange(false);
  };

  const handleAddTarget = () => {
    if (!isMountedRef.current) return;
    if (targets.length >= 3) return;

    const defaultTarget: IntensityTargetV2 = activityType?.includes("bike")
      ? { type: "%FTP", intensity: 75 }
      : activityType?.includes("run")
        ? { type: "%MaxHR", intensity: 75 }
        : { type: "RPE", intensity: 5 };

    form.setValue("targets", [...targets, defaultTarget]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveTarget = (index: number) => {
    if (!isMountedRef.current) return;

    form.setValue(
      "targets",
      targets.filter((_, i) => i !== index),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDurationTypeChange = (value: string) => {
    if (!isMountedRef.current) return;

    if (value === "untilFinished") {
      form.setValue("duration", { type: "untilFinished" });
    } else if (value === "time") {
      form.setValue("duration", { type: "time", seconds: 600 }); // 10 minutes
    } else if (value === "distance") {
      form.setValue("duration", { type: "distance", meters: 1000 }); // 1km
    } else if (value === "repetitions") {
      form.setValue("duration", { type: "repetitions", count: 10 });
    }
  };

  const getDurationUnits = () => {
    if (!durationType || durationType.type === "untilFinished") return [];
    if (durationType.type === "time") return TIME_UNITS;
    if (durationType.type === "distance") return DISTANCE_UNITS;
    return [{ value: "reps", label: "reps" }];
  };

  const currentDurationType = durationType?.type || "time";

  // Get current UI value and unit for display
  const currentUIValue =
    durationType && durationType.type !== "untilFinished"
      ? v2ToUIValue(durationType)
      : { value: 10, unit: "minutes" };

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  const dialogWidth = Math.min(screenWidth * 0.9, 400);
  const dialogHeight = Math.min(screenHeight * 0.85, screenHeight - 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          width: dialogWidth,
          height: dialogHeight,
          margin: 20,
        }}
        className="bg-background border border-border shadow-xl"
      >
        {/* Custom Header */}
        <View className="flex-row items-center justify-between p-4 border-b">
          <Text className="text-lg font-medium flex-1 text-center">
            {step ? "Edit Step" : "Add Step"}
          </Text>

          <Button onPress={handleSave} size="sm">
            <Text className="text-primary-foreground">
              {step ? "Save" : "Add"}
            </Text>
          </Button>
        </View>

        <View className="flex-1">
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View className="gap-4 p-4">
              {/* Step Name */}
              <View>
                <Label nativeID="step-name">Step Name</Label>
                <Controller
                  control={form.control}
                  name="name"
                  render={({
                    field: { onChange, value },
                    fieldState: { error },
                  }) => (
                    <>
                      <Input
                        value={value || ""}
                        onChangeText={onChange}
                        placeholder="e.g., Warm-up, Main Set, Cool-down"
                        aria-labelledby="step-name"
                      />
                      {error && (
                        <Text className="text-xs text-destructive mt-1">
                          {error.message}
                        </Text>
                      )}
                    </>
                  )}
                />
              </View>

              {/* Description */}
              <View>
                <Label nativeID="step-description">
                  Description (Optional)
                </Label>
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      value={value || ""}
                      onChangeText={onChange}
                      placeholder="Brief description of this step"
                      aria-labelledby="step-description"
                    />
                  )}
                />
              </View>

              {/* Segment Name */}
              <View>
                <Label nativeID="segment-name">Segment (Optional)</Label>
                <Controller
                  control={form.control}
                  name="segmentName"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      value={value || ""}
                      onChangeText={onChange}
                      placeholder="e.g., Warmup, Intervals, Cooldown"
                      aria-labelledby="segment-name"
                    />
                  )}
                />
              </View>

              {/* Duration Type */}
              <View>
                <Label nativeID="duration-type">Duration Type</Label>
                <Select
                  defaultValue={{
                    value: currentDurationType,
                    label: currentDurationType,
                  }}
                  onValueChange={(option) => {
                    if (typeof option === "object" && option.value) {
                      handleDurationTypeChange(option.value);
                    }
                  }}
                >
                  <SelectTrigger aria-labelledby="duration-type">
                    <SelectValue placeholder="Select duration type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_TYPES.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        label={type.label}
                      >
                        <Text>{type.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </View>

              {/* Duration Value & Unit */}
              {durationType && durationType.type !== "untilFinished" && (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Label nativeID="duration-value">Value</Label>
                    <Controller
                      control={form.control}
                      name="duration"
                      render={({ fieldState: { error } }) => (
                        <>
                          <Input
                            value={currentUIValue.value.toString()}
                            onChangeText={(text) => {
                              const num = parseFloat(text);
                              if (!isNaN(num) && durationType) {
                                const duration = form.getValues("duration");
                                if (duration.type === "time") {
                                  const seconds = uiToV2Value(
                                    "time",
                                    num,
                                    currentUIValue.unit,
                                  );
                                  form.setValue("duration", {
                                    type: "time",
                                    seconds,
                                  });
                                } else if (duration.type === "distance") {
                                  const meters = uiToV2Value(
                                    "distance",
                                    num,
                                    currentUIValue.unit,
                                  );
                                  form.setValue("duration", {
                                    type: "distance",
                                    meters,
                                  });
                                } else if (duration.type === "repetitions") {
                                  form.setValue("duration", {
                                    type: "repetitions",
                                    count: Math.round(num),
                                  });
                                }
                              }
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                            aria-labelledby="duration-value"
                          />
                          {error && (
                            <Text className="text-xs text-destructive mt-1">
                              {error.message}
                            </Text>
                          )}
                        </>
                      )}
                    />
                  </View>

                  {getDurationUnits().length > 0 && (
                    <View className="w-32">
                      <Label nativeID="duration-unit">Unit</Label>
                      <Controller
                        control={form.control}
                        name="duration"
                        render={() => (
                          <Select
                            defaultValue={{
                              value: currentUIValue.unit,
                              label: currentUIValue.unit,
                            }}
                            onValueChange={(option) => {
                              if (
                                typeof option === "object" &&
                                option.value &&
                                durationType
                              ) {
                                const newUnit = option.value;
                                const duration = form.getValues("duration");
                                if (duration.type === "time") {
                                  const seconds = uiToV2Value(
                                    "time",
                                    currentUIValue.value,
                                    newUnit,
                                  );
                                  form.setValue("duration", {
                                    type: "time",
                                    seconds,
                                  });
                                } else if (duration.type === "distance") {
                                  const meters = uiToV2Value(
                                    "distance",
                                    currentUIValue.value,
                                    newUnit,
                                  );
                                  form.setValue("duration", {
                                    type: "distance",
                                    meters,
                                  });
                                }
                              }
                            }}
                          >
                            <SelectTrigger aria-labelledby="duration-unit">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {getDurationUnits().map((unit) => (
                                <SelectItem
                                  key={unit.value}
                                  value={unit.value}
                                  label={unit.label}
                                >
                                  <Text>{unit.label}</Text>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Intensity Targets */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Label>Intensity Targets</Label>
                  {targets.length < 3 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={handleAddTarget}
                      className="h-8"
                    >
                      <Plus size={14} className="text-primary" />
                      <Text className="text-xs ml-1">Add Target</Text>
                    </Button>
                  )}
                </View>

                {targets.length === 0 && (
                  <View className="border-2 border-dashed border-muted rounded-lg p-4">
                    <Text className="text-sm text-muted-foreground text-center">
                      No intensity targets. Tap Add Target to set one.
                    </Text>
                  </View>
                )}

                {targets.map((target, index) => (
                  <View
                    key={index}
                    className="border border-border rounded-lg p-3 mb-2"
                  >
                    <View className="flex-row items-start gap-2">
                      {/* Target Type */}
                      <View className="flex-1">
                        <Label
                          nativeID={`target-type-${index}`}
                          className="text-xs mb-1"
                        >
                          Type
                        </Label>
                        <Controller
                          control={form.control}
                          name={`targets.${index}.type`}
                          render={({ field: { onChange, value } }) => (
                            <Select
                              defaultValue={{
                                value: value || "",
                                label: value || "",
                              }}
                              onValueChange={(option) => {
                                if (
                                  typeof option === "object" &&
                                  option.value
                                ) {
                                  onChange(option.value);
                                }
                              }}
                            >
                              <SelectTrigger
                                aria-labelledby={`target-type-${index}`}
                                className="h-10"
                              >
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {INTENSITY_TYPES.map((type) => (
                                  <SelectItem
                                    key={type.value}
                                    value={type.value}
                                    label={type.label}
                                  >
                                    <Text>{type.label}</Text>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </View>

                      {/* Target Value */}
                      <View className="w-20">
                        <Label
                          nativeID={`target-value-${index}`}
                          className="text-xs mb-1"
                        >
                          Value
                        </Label>
                        <Controller
                          control={form.control}
                          name={`targets.${index}.intensity`}
                          render={({
                            field: { onChange, value },
                            fieldState: { error },
                          }) => (
                            <>
                              <Input
                                value={value?.toString() || ""}
                                onChangeText={(text) => {
                                  const num = parseFloat(text);
                                  if (!isNaN(num)) onChange(num);
                                }}
                                keyboardType="numeric"
                                placeholder="0"
                                aria-labelledby={`target-value-${index}`}
                                className="h-10"
                              />
                              {error && (
                                <Text className="text-xs text-destructive mt-1">
                                  {error.message}
                                </Text>
                              )}
                            </>
                          )}
                        />
                      </View>

                      {/* Delete Button */}
                      <View className="pt-5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => handleRemoveTarget(index)}
                          className="h-10 w-10 p-0"
                        >
                          <Trash2 size={16} className="text-destructive" />
                        </Button>
                      </View>
                    </View>
                  </View>
                ))}

                {targets.length === 3 && (
                  <Text className="text-xs text-muted-foreground mt-1">
                    Maximum 3 targets per step
                  </Text>
                )}
              </View>

              {/* Notes */}
              <View>
                <Label nativeID="notes">Notes (Optional)</Label>
                <Controller
                  control={form.control}
                  name="notes"
                  render={({ field: { onChange, value } }) => (
                    <Textarea
                      value={value || ""}
                      onChangeText={onChange}
                      placeholder="Add any additional notes or instructions..."
                      aria-labelledby="notes"
                      className="min-h-[80px]"
                    />
                  )}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </DialogContent>
    </Dialog>
  );
}
