import { type DurationV2, type IntensityTargetV2, type PlanStepV2 } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Copy, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { z } from "zod";
import { AppConfirmModal, AppFormModal } from "@/components/shared/AppFormModal";

interface StepEditSheetProps {
  isVisible: boolean;
  step: PlanStepV2 | null;
  stepIndex: number | null;
  onClose: () => void;
  onSave: (updatedStep: PlanStepV2) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function StepEditSheet({
  isVisible,
  step,
  stepIndex,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
}: StepEditSheetProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const stepEditSchema = z
    .object({
      name: z.string().trim().min(1, "Please enter a step name"),
      description: z.string(),
      notes: z.string(),
      durationType: z.enum(["time", "distance", "repetitions", "untilFinished"]),
      durationValue: z.string(),
      durationUnit: z.enum(["seconds", "minutes", "hours", "meters", "km", "reps"]),
      targetType: z.enum([
        "%FTP",
        "%MaxHR",
        "%ThresholdHR",
        "watts",
        "bpm",
        "speed",
        "cadence",
        "RPE",
      ]),
      targetIntensity: z.string(),
    })
    .superRefine((value, ctx) => {
      if (value.durationType !== "untilFinished") {
        const parsed = Number(value.durationValue);
        if (!value.durationValue.trim() || !Number.isFinite(parsed) || parsed <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please enter a valid duration",
            path: ["durationValue"],
          });
        }
      }

      if (value.targetIntensity.trim()) {
        const parsed = Number(value.targetIntensity);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please enter a valid target intensity",
            path: ["targetIntensity"],
          });
        }
      }
    });

  type StepEditFormValues = z.infer<typeof stepEditSchema>;

  const form = useZodForm({
    schema: stepEditSchema,
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      durationType: "time",
      durationValue: "",
      durationUnit: "minutes",
      targetType: "%FTP",
      targetIntensity: "",
    } satisfies StepEditFormValues,
  });

  const durationType = form.watch("durationType");

  // Sync form with step prop
  useEffect(() => {
    if (step) {
      const nextValues: StepEditFormValues = {
        name: step.name || "",
        description: step.description || "",
        notes: step.notes || "",
        durationType: step.duration.type,
        durationValue: "",
        durationUnit: "minutes",
        targetType: "%FTP",
        targetIntensity: "",
      };

      const duration = step.duration;
      if (duration.type === "time") {
        if (duration.seconds >= 3600) {
          nextValues.durationValue = String(duration.seconds / 3600);
          nextValues.durationUnit = "hours";
        } else if (duration.seconds >= 60) {
          nextValues.durationValue = String(duration.seconds / 60);
          nextValues.durationUnit = "minutes";
        } else {
          nextValues.durationValue = String(duration.seconds);
          nextValues.durationUnit = "seconds";
        }
      } else if (duration.type === "distance") {
        if (duration.meters >= 1000) {
          nextValues.durationValue = String(duration.meters / 1000);
          nextValues.durationUnit = "km";
        } else {
          nextValues.durationValue = String(duration.meters);
          nextValues.durationUnit = "meters";
        }
      } else if (duration.type === "repetitions") {
        nextValues.durationValue = String(duration.count);
        nextValues.durationUnit = "reps";
      } else if (duration.type === "untilFinished") {
        nextValues.durationValue = "";
        nextValues.durationUnit = "minutes";
      }

      if (step.targets && step.targets.length > 0) {
        const target = step.targets[0];
        nextValues.targetType = target.type as StepEditFormValues["targetType"];
        nextValues.targetIntensity = String(target.intensity);
      }

      form.reset(nextValues);
    } else {
      form.reset({
        name: "",
        description: "",
        notes: "",
        durationType: "time",
        durationValue: "",
        durationUnit: "minutes",
        targetType: "%FTP",
        targetIntensity: "",
      });
    }
  }, [form, isVisible, step]);

  useEffect(() => {
    if (durationType === "time") {
      form.setValue("durationUnit", "minutes", { shouldDirty: true });
    } else if (durationType === "distance") {
      form.setValue("durationUnit", "km", { shouldDirty: true });
    } else if (durationType === "repetitions") {
      form.setValue("durationUnit", "reps", { shouldDirty: true });
    }
  }, [durationType, form]);

  const handleSave = (values: StepEditFormValues) => {
    let duration: DurationV2;

    if (values.durationType === "untilFinished") {
      duration = { type: "untilFinished" };
    } else if (values.durationType === "time") {
      const durationVal = Number(values.durationValue);
      let seconds = durationVal;
      if (values.durationUnit === "minutes") {
        seconds = durationVal * 60;
      } else if (values.durationUnit === "hours") {
        seconds = durationVal * 3600;
      }
      duration = { type: "time", seconds: Math.round(seconds) };
    } else if (values.durationType === "distance") {
      const durationVal = Number(values.durationValue);
      let meters = durationVal;
      if (values.durationUnit === "km") {
        meters = durationVal * 1000;
      }
      duration = { type: "distance", meters: Math.round(meters) };
    } else {
      duration = { type: "repetitions", count: Math.round(Number(values.durationValue)) };
    }

    let targets: IntensityTargetV2[] | undefined;

    if (values.targetIntensity.trim()) {
      const target: IntensityTargetV2 = {
        type: values.targetType as any,
        intensity: Number(values.targetIntensity),
      };
      targets = [target];
    }

    const updatedStep: PlanStepV2 = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      notes: values.notes.trim() || undefined,
      duration,
      targets,
      segmentName: step?.segmentName,
      segmentIndex: step?.segmentIndex,
      originalRepetitionCount: step?.originalRepetitionCount,
    };

    onSave(updatedStep);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  if (!isVisible) {
    return null;
  }

  const submitForm = useZodFormSubmit<StepEditFormValues>({
    form,
    onSubmit: handleSave,
  });

  return (
    <>
      <AppFormModal
        description="Configure the step duration and target intensity."
        onClose={onClose}
        primaryAction={
          <Button onPress={submitForm.handleSubmit} testID="step-edit-sheet-save-button">
            <Text className="text-primary-foreground">{step ? "Save Changes" : "Add Step"}</Text>
          </Button>
        }
        secondaryAction={
          <Button variant="outline" onPress={onClose} testID="step-edit-sheet-cancel-button">
            <Text>Cancel</Text>
          </Button>
        }
        testID="step-edit-sheet-modal"
        title={step ? `Edit Step ${(stepIndex ?? 0) + 1}` : "Add New Step"}
      >
        {step ? (
          <View className="flex-row gap-2">
            <Button variant="outline" onPress={onDuplicate} className="flex-1">
              <Icon as={Copy} size={16} className="text-foreground" />
              <Text>Duplicate</Text>
            </Button>
            <Button variant="outline" onPress={handleDelete} className="flex-1">
              <Icon as={Trash2} size={16} className="text-destructive" />
              <Text className="text-destructive">Delete</Text>
            </Button>
          </View>
        ) : null}

        <ScrollView className="max-h-[500px]">
          <Form {...form}>
            <View className="flex flex-col gap-4">
              <FormTextField
                control={form.control}
                label="Step Name"
                name="name"
                placeholder="e.g., Warm-up, Interval, Cool-down"
                required
              />

              <FormTextareaField
                control={form.control}
                label="Description"
                name="description"
                placeholder="Brief description of this step"
                numberOfLines={2}
              />

              <View className="gap-3">
                <Text className="font-semibold text-foreground">Duration</Text>

                <FormSelectField
                  control={form.control}
                  label="Duration Type"
                  name="durationType"
                  options={[
                    { label: "Time", value: "time" },
                    { label: "Distance", value: "distance" },
                    { label: "Repetitions", value: "repetitions" },
                    { label: "Until Finished", value: "untilFinished" },
                  ]}
                  placeholder="Select duration type"
                />

                {durationType !== "untilFinished" ? (
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <FormTextField
                        control={form.control}
                        label="Value"
                        name="durationValue"
                        placeholder="e.g., 5"
                        required
                        keyboardType="numeric"
                      />
                    </View>

                    {durationType !== "repetitions" ? (
                      <View className="flex-1">
                        <FormSelectField
                          control={form.control}
                          label="Unit"
                          name="durationUnit"
                          options={
                            durationType === "time"
                              ? [
                                  { label: "Seconds", value: "seconds" },
                                  { label: "Minutes", value: "minutes" },
                                  { label: "Hours", value: "hours" },
                                ]
                              : [
                                  { label: "Meters", value: "meters" },
                                  { label: "Kilometers", value: "km" },
                                ]
                          }
                          placeholder="Unit"
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View className="gap-3">
                <Text className="font-semibold text-foreground">Target Intensity (optional)</Text>

                <FormSelectField
                  control={form.control}
                  label="Target Type"
                  name="targetType"
                  options={[
                    { label: "% FTP (Power)", value: "%FTP" },
                    { label: "% Max HR", value: "%MaxHR" },
                    { label: "% Threshold HR", value: "%ThresholdHR" },
                    { label: "Watts", value: "watts" },
                    { label: "BPM", value: "bpm" },
                    { label: "Speed (m/s)", value: "speed" },
                    { label: "Cadence (rpm)", value: "cadence" },
                    { label: "RPE (1-10)", value: "RPE" },
                  ]}
                  placeholder="Select target type"
                />

                <FormTextField
                  control={form.control}
                  label="Intensity Value"
                  name="targetIntensity"
                  placeholder="e.g., 85"
                  keyboardType="numeric"
                />
              </View>

              <FormTextareaField
                control={form.control}
                label="Notes"
                name="notes"
                placeholder="Additional notes or instructions"
                numberOfLines={3}
              />
            </View>
          </Form>
        </ScrollView>
      </AppFormModal>

      {showDeleteConfirm ? (
        <AppConfirmModal
          description="Are you sure you want to delete this step?"
          onClose={() => setShowDeleteConfirm(false)}
          primaryAction={{
            label: "Delete Step",
            onPress: () => {
              setShowDeleteConfirm(false);
              onDelete();
            },
            variant: "destructive",
            testID: "step-edit-sheet-delete-confirm",
          }}
          secondaryAction={{
            label: "Cancel",
            onPress: () => setShowDeleteConfirm(false),
            variant: "outline",
          }}
          testID="step-edit-sheet-delete-modal"
          title="Delete Step"
        />
      ) : null}
    </>
  );
}
