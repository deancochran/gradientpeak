import type { IntensityTargetV2, IntervalStepV2 } from "@repo/core/schemas/activity_plan_v2";
import { Button } from "@repo/ui/components/button";
import { Dialog, DialogContent } from "@repo/ui/components/dialog";
import {
  Form,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import * as Haptics from "expo-haptics";
import { Plus, Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { Dimensions, ScrollView, View } from "react-native";
import { z } from "zod";
import { StepDurationField } from "./StepDurationField";

interface StepEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: IntervalStepV2;
  onSave: (step: IntervalStepV2) => void;
  activityType?: string;
  defaultSegmentName?: string;
}

// Form schema for V2 step editing - uses V2 duration format directly
const formSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  description: z.string().optional(),
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
  ]),
  targets: z
    .array(
      z.object({
        type: z.enum(["%FTP", "%MaxHR", "%ThresholdHR", "watts", "bpm", "speed", "cadence", "RPE"]),
        intensity: z.number().positive(),
      }),
    )
    .min(1, "At least one target is required")
    .max(3),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// Helper type for UI display - internal to component only
type DurationUI =
  | { type: "time"; value: number; unit: "seconds" | "minutes" | "hours" }
  | { type: "distance"; value: number; unit: "meters" | "km" }
  | { type: "repetitions"; value: number; unit: "reps" }
  | { type: "untilFinished" };

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
  defaultSegmentName,
}: StepEditorDialogProps) {
  const isMountedRef = useRef(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useZodForm({
    schema: formSchema,
    defaultValues: {
      name: "New Step",
      description: "",
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
        duration:
          step.duration.type === "untilFinished" ? { type: "time", seconds: 300 } : step.duration,
        targets: step.targets || [],
        notes: step.notes || "",
      });
      setSaveError(null);
    } else if (open) {
      // Creating new step - use V2 format
      form.reset({
        name: "New Step",
        description: "",
        duration: { type: "time", seconds: 600 }, // 10 minutes
        targets: [],
        notes: "",
      });
      setSaveError(null);
    }
  }, [step, form, open, defaultSegmentName]);

  const handleSave = () => {
    if (!isMountedRef.current) return;

    const values = form.getValues();
    const result = formSchema.safeParse(values);

    if (!result.success) {
      setSaveError(result.error.issues[0]?.message ?? "Fix step inputs.");
      return;
    }

    setSaveError(null);

    // Create IntervalStepV2 - duration is already in V2 format
    const stepV2: IntervalStepV2 = {
      id: step?.id || require("expo-crypto").randomUUID(),
      name: result.data.name,
      description: result.data.description,
      duration: result.data.duration, // Already in V2 format
      targets: result.data.targets as IntensityTargetV2[],
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

    if (value === "time") {
      form.setValue("duration", { type: "time", seconds: 600 }); // 10 minutes
    } else if (value === "distance") {
      form.setValue("duration", { type: "distance", meters: 1000 }); // 1km
    } else if (value === "repetitions") {
      form.setValue("duration", { type: "repetitions", count: 10 });
    }
  };

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
            <Text className="text-primary-foreground">{step ? "Save" : "Add"}</Text>
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
              <Form {...form}>
                <FormTextField
                  control={form.control}
                  label="Step Name"
                  name="name"
                  placeholder="e.g., Warm-up, Main Set, Cool-down"
                />
              </Form>

              {/* Description */}
              <Form {...form}>
                <FormTextField
                  control={form.control}
                  label="Description"
                  name="description"
                  placeholder="Brief description of this step"
                />
              </Form>

              <Form {...form}>
                <StepDurationField form={form as never} />
              </Form>

              {/* Intensity Targets */}
              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Label>Intensity Targets</Label>
                  {targets.length < 3 && (
                    <Button variant="outline" size="sm" onPress={handleAddTarget} className="h-8">
                      <Plus size={14} className="text-primary" />
                      <Text className="text-xs ml-1">Add Target</Text>
                    </Button>
                  )}
                </View>

                {targets.length === 0 && (
                  <View className="border-2 border-dashed border-muted rounded-lg p-4">
                    <Text className="text-sm text-muted-foreground text-center">
                      Add at least one target before saving.
                    </Text>
                  </View>
                )}

                {targets.map((target, index) => (
                  <View key={index} className="border border-border rounded-lg p-3 mb-2">
                    <View className="flex-row items-start gap-2">
                      {/* Target Type */}
                      <View className="flex-1">
                        <Label nativeID={`target-type-${index}`} className="text-xs mb-1">
                          Type
                        </Label>
                        <Form {...form}>
                          <FormSelectField
                            control={form.control}
                            label="Type"
                            name={`targets.${index}.type` as never}
                            options={INTENSITY_TYPES}
                            placeholder="Select type"
                            testId={`target-type-${index}`}
                          />
                        </Form>
                      </View>

                      {/* Target Value */}
                      <View className="w-20">
                        <Label nativeID={`target-value-${index}`} className="text-xs mb-1">
                          Value
                        </Label>
                        <Form {...form}>
                          <FormNumberField
                            allowDecimal
                            control={form.control}
                            label="Value"
                            min={0}
                            name={`targets.${index}.intensity` as never}
                            placeholder="0"
                            testId={`target-value-${index}`}
                          />
                        </Form>
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

              {saveError ? <Text className="text-xs text-destructive">{saveError}</Text> : null}

              {/* Notes */}
              <View>
                <Form {...form}>
                  <FormTextareaField
                    control={form.control}
                    label="Notes"
                    name="notes"
                    placeholder="Add any additional notes or instructions..."
                    className="min-h-[80px]"
                  />
                </Form>
              </View>
            </View>
          </ScrollView>
        </View>
      </DialogContent>
    </Dialog>
  );
}
