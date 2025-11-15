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

import { createDefaultStep, type IntensityTarget, type Step } from "@repo/core";
import * as Haptics from "expo-haptics";
import { Plus, Trash2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { Dimensions, ScrollView, View } from "react-native";
import { z } from "zod";

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: Step;
  onSave: (step: Step) => void;
  activityType?: string;
}

// Form schema that matches the Step type
const formSchema = z.object({
  type: z.literal("step"),
  name: z.string().min(1, "Step name is required"),
  duration: z
    .union([
      z.object({
        type: z.literal("time"),
        value: z.number().min(1),
        unit: z.enum(["seconds", "minutes"]),
      }),
      z.object({
        type: z.literal("distance"),
        value: z.number().min(1),
        unit: z.enum(["meters", "km"]),
      }),
      z.object({
        type: z.literal("repetitions"),
        value: z.number().min(1),
        unit: z.literal("reps"),
      }),
      z.literal("untilFinished"),
    ])
    .optional(),
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
    .max(2)
    .optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const DURATION_TYPES = [
  { value: "time", label: "Time-based" },
  { value: "distance", label: "Distance-based" },
  { value: "repetitions", label: "Repetitions" },
  { value: "untilFinished", label: "Until Finished" },
];

const TIME_UNITS = [
  { value: "seconds", label: "seconds" },
  { value: "minutes", label: "minutes" },
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

export function StepEditorDialog({
  open,
  onOpenChange,
  step,
  onSave,
  activityType,
}: StepEditorDialogProps) {
  const isMountedRef = useRef(true);

  // Create default step for initial form values
  const defaultStep = createDefaultStep({
    activityType: activityType || "outdoor_run",
    position: 0,
    totalSteps: 1,
  });

  const form = useForm<FormData>({
    defaultValues: {
      type: "step",
      name: defaultStep.name ?? "New Step",
      duration:
        defaultStep.duration === "untilFinished"
          ? { type: "time", value: 10, unit: "minutes" }
          : defaultStep.duration,
      targets: defaultStep.targets || [],
      notes: defaultStep.notes || "",
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

    console.log("🔄 StepEditorDialog: Resetting form", {
      step,
      open,
      activityType,
    });

    if (step) {
      // Editing existing step
      console.log("📝 Editing existing step:", step.name);
      form.reset({
        type: "step",
        name: step.name || "",
        duration: step.duration || { type: "time", value: 10, unit: "minutes" },
        targets: step.targets || [],
        notes: step.notes || "",
      });
    } else if (open) {
      // Creating new step - only reset when dialog actually opens
      console.log("➕ Creating new step with defaults");
      const defaultStep = createDefaultStep({
        activityType: activityType || "outdoor_run",
        position: 0,
        totalSteps: 1,
      });

      console.log("🎯 Default step created:", defaultStep);

      const formValues = {
        type: "step" as const,
        name: defaultStep.name ?? "New Step",
        duration:
          defaultStep.duration === "untilFinished"
            ? { type: "time" as const, value: 10, unit: "minutes" as const }
            : defaultStep.duration,
        targets: defaultStep.targets || [],
        notes: defaultStep.notes || "",
      };

      console.log("📋 Form values to set:", formValues);
      form.reset(formValues);

      // Force update form values to ensure they stick
      setTimeout(() => {
        form.setValue("name", formValues.name);
        form.setValue("duration", formValues.duration);
        form.setValue("targets", formValues.targets);
      }, 100);
    }
  }, [step, form, activityType, open]);

  const handleSave = () => {
    if (!isMountedRef.current) return;

    const values = form.getValues();
    console.log("💾 Attempting to save step with values:", values);

    const result = formSchema.safeParse(values);

    if (!result.success) {
      console.error("❌ Validation errors:", result.error.flatten());
      console.error("❌ Failed values:", values);
      // Show the first validation error to help debug
      const firstError = result.error.issues[0];
      if (firstError) {
        console.error(
          "❌ First error:",
          firstError.path.join("."),
          firstError.message,
        );
      }
      return;
    }

    console.log("✅ Validation passed, saving step:", result.data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(result.data as Step);
    onOpenChange(false);
  };

  const handleAddTarget = () => {
    if (!isMountedRef.current) return;
    if (targets.length >= 2) return;

    const defaultTarget: IntensityTarget = activityType?.includes("bike")
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
      form.setValue("duration", "untilFinished");
    } else if (value === "time") {
      form.setValue("duration", { type: "time", value: 10, unit: "minutes" });
    } else if (value === "distance") {
      form.setValue("duration", {
        type: "distance",
        value: 1000,
        unit: "meters",
      });
    } else if (value === "repetitions") {
      form.setValue("duration", {
        type: "repetitions",
        value: 10,
        unit: "reps",
      });
    }
  };

  const getDurationUnits = () => {
    if (!durationType || durationType === "untilFinished") return [];
    if (durationType.type === "time") return TIME_UNITS;
    if (durationType.type === "distance") return DISTANCE_UNITS;
    return [{ value: "reps", label: "reps" }];
  };

  const currentDurationType =
    durationType === "untilFinished" || !durationType
      ? "untilFinished"
      : durationType.type;

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
              {durationType && durationType !== "untilFinished" && (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Label nativeID="duration-value">Value</Label>
                    <Controller
                      control={form.control}
                      name="duration.value"
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
                        name="duration.unit"
                        render={({ field: { onChange, value } }) => (
                          <Select
                            defaultValue={{
                              value: value || "",
                              label: value || "",
                            }}
                            onValueChange={(option) => {
                              if (typeof option === "object" && option.value) {
                                onChange(option.value);
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
                  {targets.length < 2 && (
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

                {targets.length === 2 && (
                  <Text className="text-xs text-muted-foreground mt-1">
                    Maximum 2 targets per step
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
